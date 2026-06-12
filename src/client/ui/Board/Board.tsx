import type { ActionSpaceState } from "../../../state/ActionSpaceState";
import { placeWorker } from "../../socket/clientSocket";
import { useGameStore } from "../../store/gameStore";
import { ActionSpace } from "../ActionSpace/ActionSpace";
import { RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";
import { getPlayerColorById } from "../VisualSystem/playerColors";

const emptyActionSpaces: ActionSpaceState[] = [];
const directEffectTypes = new Set(["takeAccumulated", "gainResource", "takeStartingPlayer"]);

interface BoardProps {
  onSelfAction?: () => void;
}

export function Board({ onSelfAction }: BoardProps) {
  const { game, roomId, username, setNotice } = useGameStore();
  const actionSpaces = game?.actionSpaces ?? emptyActionSpaces;
  const currentPlayer = game?.players.find((player) => player.id === game.currentPlayer) ?? null;
  const currentRound = game?.round ?? 0;
  const currentWorker = currentPlayer?.workers.find((worker) => worker.location === "home" && worker.availableRound <= currentRound);
  const isMyTurn = Boolean(game && username && game.phase === "WORK_PHASE" && game.currentPlayer === username);
  const currentPlayerColor = getPlayerColorById(game?.players ?? [], currentPlayer?.id);

  function handleActionClick(actionSpace: ActionSpaceState, sourceElement: HTMLElement) {
    if (!game || !roomId || !currentPlayer || !currentWorker) {
      setNotice("当前没有可用工人。");
      return;
    }
    if (!isMyTurn) {
      setNotice("还没有轮到你行动。");
      return;
    }
    if (actionSpace.occupiedBy) {
      setNotice("这个行动格已经被占用。");
      return;
    }
    if (!canDirectExecute(actionSpace)) {
      setNotice("这个行动需要选择农场格或卡牌，暂时不能直接点击执行。");
      return;
    }

    onSelfAction?.();
    window.setTimeout(() => animateActionResources(actionSpace, sourceElement, currentPlayer.id), 30);
    window.setTimeout(() => {
      placeWorker(roomId, currentPlayer.id, currentWorker.id, actionSpace.id, {});
    }, 180);
  }

  return (
    <section className="panel board-panel">
      <header className="board-panel__header">
        <div>
          <h2>公共行动区</h2>
          <p className="muted">{isMyTurn ? "轮到你了，点击行动格执行。" : "等待当前玩家行动。"}</p>
        </div>
      </header>
      <div className="action-space-grid">
        {actionSpaces.length === 0 ? (
          <p className="muted">暂无行动格。</p>
        ) : (
          actionSpaces.map((actionSpace) => (
            <ActionSpace
              key={actionSpace.id}
              actionSpace={actionSpace}
              isInteractive={isMyTurn && !actionSpace.occupiedBy && canDirectExecute(actionSpace)}
              occupiedColor={getPlayerColorById(game?.players ?? [], actionSpace.occupiedBy)}
              onExecute={(sourceElement) => handleActionClick(actionSpace, sourceElement)}
            />
          ))
        )}
      </div>
      <footer className="board-panel__turn" style={{ ["--player-color" as string]: currentPlayerColor }}>
        <span className="turn-marker" aria-hidden="true" />
        <strong>轮到：{currentPlayer?.name ?? "等待玩家"}</strong>
        <span>{isMyTurn ? "点击行动格执行" : game?.phase === "WORK_PHASE" ? "等待对方行动" : "等待阶段推进"}</span>
      </footer>
    </section>
  );
}

function canDirectExecute(actionSpace: ActionSpaceState): boolean {
  if (actionSpace.type === "placeholder") return false;
  const leafEffects = flattenEffects(actionSpace.effects);
  return leafEffects.length > 0 && leafEffects.every((effect) => directEffectTypes.has(effect.type));
}

function flattenEffects(effects: ActionSpaceState["effects"]): Array<{ type: string }> {
  return effects.flatMap((effect) => ("effects" in effect && effect.effects ? flattenEffects(effect.effects) : [effect]));
}

function animateActionResources(actionSpace: ActionSpaceState, sourceElement: HTMLElement, playerId: string): void {
  if (typeof document === "undefined") return;

  const resources = Object.entries(actionSpace.accumulated).filter((entry): entry is [ResourceIconKey, number] => isIconKey(entry[0]) && entry[1] > 0);
  const gains = Object.entries(actionSpace.gain).filter((entry): entry is [ResourceIconKey, number] => isIconKey(entry[0]) && entry[1] > 0);
  const movingResources = resources.length > 0 ? resources : gains;

  movingResources.forEach(([resource, count]) => {
    const target = document.querySelector(`[data-resource-owner="${CSS.escape(playerId)}"][data-resource="${resource}"]`);
    if (!(target instanceof HTMLElement)) return;

    const sourceRect = sourceElement.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const amount = Math.min(Math.max(count, 1), 12);

    const iconMarkup = sourceElement.querySelector(`[data-action-resource="${resource}"] svg`)?.outerHTML ?? `<span>${resource.slice(0, 1).toUpperCase()}</span>`;

    for (let index = 0; index < amount; index += 1) {
      window.setTimeout(() => createFlyingToken(iconMarkup, sourceRect, targetRect, index), index * 55);
    }
  });
}

function createFlyingToken(iconMarkup: string, sourceRect: DOMRect, targetRect: DOMRect, index: number): void {
  const mount = document.createElement("div");
  mount.className = "flying-resource";
  mount.style.left = `${sourceRect.left + sourceRect.width / 2 - 14 + (index % 3) * 6}px`;
  mount.style.top = `${sourceRect.top + sourceRect.height / 2 - 14}px`;
  mount.style.setProperty("--fly-x", `${targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2}px`);
  mount.style.setProperty("--fly-y", `${targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2}px`);
  mount.innerHTML = iconMarkup;
  document.body.appendChild(mount);
  window.setTimeout(() => mount.remove(), 760);
}

function isIconKey(value: string): value is ResourceIconKey {
  return value in RESOURCE_ICONS;
}
