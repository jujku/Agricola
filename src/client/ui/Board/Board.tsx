import { useMemo, useState } from "react";
import type { ActionInput, AnimalPlacementInput } from "../../../shared/types";
import type { ActionSpaceState } from "../../../state/ActionSpaceState";
import type { FarmAnimalType, FenceEdgeSide, FenceSegment } from "../../../state/FarmState";
import type { PlayerState } from "../../../state/PlayerState";
import { placeWorker } from "../../socket/clientSocket";
import { useGameStore } from "../../store/gameStore";
import { ActionSpace } from "../ActionSpace/ActionSpace";
import { RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";
import { getPlayerColorById } from "../VisualSystem/playerColors";

const emptyActionSpaces: ActionSpaceState[] = [];
const directEffectTypes = new Set(["takeAccumulated", "gainResource", "takeStartingPlayer"]);
const farmInteractionTypes = new Set(["plowField", "buildRooms", "buildStables", "buildFences", "sow", "gainAnimal", "gainMissingAnimal", "farmingSupplies", "sideJob"]);
type FarmActionMode = "field" | "room" | "stable" | "fence" | "sow" | "animal";

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
  const [pendingAction, setPendingAction] = useState<{ actionSpace: ActionSpaceState; sourceElement: HTMLElement } | null>(null);
  const [farmAction, setFarmAction] = useState<ActionSpaceState | null>(null);

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
    if (canDirectExecute(actionSpace)) {
      setPendingAction({ actionSpace, sourceElement });
      return;
    }
    if (canFarmInteract(actionSpace)) {
      setFarmAction(actionSpace);
      onSelfAction?.();
      return;
    }
    setNotice("这个行动需要卡牌或发展卡选择，暂时不能执行。");
  }

  function executeAction(actionSpace: ActionSpaceState, input: ActionInput = {}, sourceElement?: HTMLElement) {
    if (!game || !roomId || !currentPlayer || !currentWorker) return;
    if (sourceElement) {
      onSelfAction?.();
      window.setTimeout(() => animateActionResources(actionSpace, sourceElement, currentPlayer.id), 30);
    }
    window.setTimeout(() => {
      placeWorker(roomId, currentPlayer.id, currentWorker.id, actionSpace.id, input);
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
      <div className="board-panel__turn board-panel__turn--top" style={{ ["--player-color" as string]: currentPlayerColor }}>
        <span className="turn-marker" aria-hidden="true" />
        <strong>轮到：{currentPlayer?.name ?? "等待玩家"}</strong>
        <span>{isMyTurn ? "点击行动格执行" : game?.phase === "WORK_PHASE" ? "等待对方行动" : "等待阶段推进"}</span>
      </div>
      <div className="action-space-grid">
        {actionSpaces.length === 0 ? (
          <p className="muted">暂无行动格。</p>
        ) : (
          actionSpaces.map((actionSpace) => (
            <ActionSpace
              key={actionSpace.id}
              actionSpace={actionSpace}
              isInteractive={isMyTurn && !actionSpace.occupiedBy && (canDirectExecute(actionSpace) || canFarmInteract(actionSpace))}
              occupiedColor={getPlayerColorById(game?.players ?? [], actionSpace.occupiedBy)}
              onExecute={(sourceElement) => handleActionClick(actionSpace, sourceElement)}
            />
          ))
        )}
      </div>
      {pendingAction ? (
        <ConfirmActionOverlay
          actionName={pendingAction.actionSpace.name}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            executeAction(pendingAction.actionSpace, createDirectActionInput(pendingAction.actionSpace), pendingAction.sourceElement);
            setPendingAction(null);
          }}
        />
      ) : null}
      {farmAction && game && currentPlayer ? (
        <FarmActionOverlay
          actionSpace={farmAction}
          player={currentPlayer}
          onCancel={() => setFarmAction(null)}
          onConfirm={(input) => {
            executeAction(farmAction, input);
            setFarmAction(null);
          }}
        />
      ) : null}
    </section>
  );
}

function canDirectExecute(actionSpace: ActionSpaceState): boolean {
  if (actionSpace.type === "placeholder") return false;
  if (hasAccumulatedAnimal(actionSpace)) return false;
  const leafEffects = flattenEffects(actionSpace.effects);
  return leafEffects.length > 0 && leafEffects.every((effect) => directEffectTypes.has(effect.type) || isUnavailableCardEffect(effect.type));
}

function canFarmInteract(actionSpace: ActionSpaceState): boolean {
  if (hasAccumulatedAnimal(actionSpace)) return true;
  const leafEffects = flattenEffects(actionSpace.effects);
  return leafEffects.some((effect) => farmInteractionTypes.has(effect.type));
}

function flattenEffects(effects: ActionSpaceState["effects"]): Array<{ type: string }> {
  return effects.flatMap((effect) => ("effects" in effect && effect.effects ? flattenEffects(effect.effects) : [effect]));
}

function isUnavailableCardEffect(type: string): boolean {
  return type === "playOccupationPlaceholder" || type === "playMinorImprovementPlaceholder";
}

function createDirectActionInput(actionSpace: ActionSpaceState): ActionInput {
  const selectable = flattenEffects(actionSpace.effects).map((effect) => effect.type).filter((type) => !isUnavailableCardEffect(type));
  return selectable.length > 0 ? { selectedEffectTypes: selectable } : {};
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

    const iconMarkup =
      sourceElement.querySelector(`[data-action-resource="${resource}"] [data-sprite-icon]`)?.outerHTML ??
      sourceElement.querySelector(`[data-action-resource="${resource}"] svg`)?.outerHTML ??
      `<span>${resource.slice(0, 1).toUpperCase()}</span>`;

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

function ConfirmActionOverlay({ actionName, onCancel, onConfirm }: { actionName: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal">
        <span className="game-modal__eyebrow">派遣工人</span>
        <h2>{actionName}</h2>
        <p>确认派遣工人执行这个行动吗？</p>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onCancel}>取消</button>
          <button onClick={onConfirm}>确认执行</button>
        </footer>
      </section>
    </div>
  );
}

function hasAccumulatedAnimal(actionSpace: ActionSpaceState): boolean {
  return (["sheep", "boar", "cattle"] as FarmAnimalType[]).some((animal) => (actionSpace.accumulated[animal] ?? 0) > 0);
}

function FarmActionOverlay({
  actionSpace,
  onCancel,
  onConfirm,
  player,
}: {
  actionSpace: ActionSpaceState;
  onCancel: () => void;
  onConfirm: (input: ActionInput) => void;
  player: PlayerState;
}) {
  const effectTypes = useMemo(() => flattenEffects(actionSpace.effects).map((effect) => effect.type), [actionSpace]);
  const mode = pickFarmMode(effectTypes, actionSpace);
  const animalAmount = pickAnimalAmount(actionSpace);
  const initialAnimal = pickAnimal(actionSpace) ?? "sheep";
  const availableAnimals = pickAnimal(actionSpace) ? [initialAnimal] : (["sheep", "boar", "cattle"] as FarmAnimalType[]);
  const [selectedCells, setSelectedCells] = useState<Array<{ row: number; col: number }>>([]);
  const [selectedSegments, setSelectedSegments] = useState<FenceSegment[]>([]);
  const [crop, setCrop] = useState<"grain" | "vegetable">("grain");
  const [animal, setAnimal] = useState<FarmAnimalType>(initialAnimal);
  const [animalPlacements, setAnimalPlacements] = useState<AnimalPlacementInput["placements"]>([]);
  const [cookedAnimals, setCookedAnimals] = useState(0);

  const availableFenceSlots = Math.max(0, 15 - (player.farm.fencesUsed ?? player.farm.fences.length));
  const roomCost = calculateRoomCost(player, selectedCells.length);
  const discardAnimals = Math.max(0, animalAmount - sumPlacements(animalPlacements) - cookedAnimals);
  const input = createFarmActionInput(mode, effectTypes, selectedCells, selectedSegments, crop, animal, animalPlacements, cookedAnimals, discardAnimals);
  const selectedGrainCells = mode === "sow" && crop === "grain" ? selectedCells.length : 0;
  const selectedVegetableCells = mode === "sow" && crop === "vegetable" ? selectedCells.length : 0;
  const canConfirm =
    mode === "fence"
      ? selectedSegments.length > 0 && selectedSegments.length <= player.resources.wood && selectedSegments.length <= availableFenceSlots
      : mode === "animal"
        ? sumPlacements(animalPlacements) + cookedAnimals <= animalAmount
        : mode === "sow"
          ? selectedCells.length > 0 && selectedGrainCells <= player.resources.grain && selectedVegetableCells <= player.resources.vegetable
          : mode === "room"
            ? selectedCells.length > 0 && canPayRoomCost(player, selectedCells.length)
            : selectedCells.length > 0;

  function toggleCell(row: number, col: number) {
    const key = `${row}:${col}`;
    setSelectedCells((current) => {
      if (current.some((cell) => `${cell.row}:${cell.col}` === key)) {
        return current.filter((cell) => `${cell.row}:${cell.col}` !== key);
      }
      if (mode === "field") {
        return [{ row, col }];
      }
      return [...current, { row, col }];
    });
  }

  function toggleSegment(segment: FenceSegment) {
    const key = segmentKey(segment);
    setSelectedSegments((current) => (current.some((item) => segmentKey(item) === key) ? current.filter((item) => segmentKey(item) !== key) : [...current, segment]));
  }

  function toggleAnimalPlacement(placement: AnimalPlacementInput["placements"][number], capacity: number) {
    setAnimalPlacements((current) => {
      const key = placementKey(placement);
      const existing = current.find((item) => placementKey(item) === key);
      if (existing) {
        return current.filter((item) => placementKey(item) !== key);
      }
      const alreadyPlaced = sumPlacements(current);
      const count = Math.min(capacity, animalAmount - alreadyPlaced);
      if (count <= 0) return current;
      return [...current, { ...placement, count }];
    });
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal farm-action-modal">
        <span className="game-modal__eyebrow">农场行动</span>
        <h2>{actionSpace.name}</h2>
        <p>{farmActionHelp(mode)}</p>
        {mode === "sow" ? (
          <div className="segmented">
            <button className={crop === "grain" ? "active" : ""} onClick={() => setCrop("grain")}>谷物 {player.resources.grain}</button>
            <button className={crop === "vegetable" ? "active" : ""} onClick={() => setCrop("vegetable")}>蔬菜 {player.resources.vegetable}</button>
          </div>
        ) : null}
        {mode === "animal" ? (
          <div className="segmented">
            {availableAnimals.map((item) => (
              <button
                key={item}
                className={animal === item ? "active" : ""}
                onClick={() => {
                  setAnimal(item);
                  setAnimalPlacements([]);
                  setCookedAnimals(0);
                }}
              >
                {translateAnimal(item)} x {animalAmount}
              </button>
            ))}
          </div>
        ) : null}
        {mode === "room" ? (
          <div className="room-cost-panel">
            <span>木屋：每间 5 木材 + 2 芦苇</span>
            <span>黏土房：每间 5 黏土 + 2 芦苇</span>
            <span>石屋：每间 5 石头 + 2 芦苇</span>
          </div>
        ) : null}
        <div className={`farm-picker farm-picker--${mode}`}>
          {Array.from({ length: 3 }, (_, row) =>
            Array.from({ length: 5 }, (_, col) => {
              const cell = player.farm.cells.find((candidate) => candidate.row === row && candidate.col === col);
              const selected = selectedCells.some((item) => item.row === row && item.col === col);
              const valid = mode === "fence" || isCellValidForMode(mode, cell, player, selectedCells);
              const animalTarget = mode === "animal" ? getAnimalTarget(player, row, col, animal) : null;
              const animalSelected = animalTarget ? animalPlacements.some((item) => placementKey(item) === placementKey(animalTarget.placement)) : false;
              return (
                <button
                  key={`${row}-${col}`}
                  className={`farm-picker__cell ${selected || animalSelected ? "selected" : ""} ${valid || animalTarget ? "" : "invalid"}`}
                  disabled={mode !== "fence" && !valid && !animalTarget}
                  onClick={() => {
                    if (mode === "fence") return;
                    if (mode === "animal" && animalTarget) {
                      toggleAnimalPlacement(animalTarget.placement, animalTarget.capacity);
                      return;
                    }
                    toggleCell(row, col);
                  }}
                  type="button"
                >
                  {mode === "fence" ? (
                    (["top", "right", "bottom", "left"] as FenceEdgeSide[]).map((edge) => (
                      <span
                        key={edge}
                        className={`farm-picker__edge farm-picker__edge--${edge} ${
                          !isFenceSegmentBuildable(player, edgeToSegment(row, col, edge))
                            ? "invalid"
                            : hasFence(player, edgeToSegment(row, col, edge))
                            ? "placed"
                            : selectedSegments.some((item) => segmentKey(item) === segmentKey(edgeToSegment(row, col, edge)))
                              ? "selected"
                              : ""
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const segment = edgeToSegment(row, col, edge);
                          if (hasFence(player, segment) || !isFenceSegmentBuildable(player, segment)) return;
                          toggleSegment(segment);
                        }}
                      />
                    ))
                  ) : null}
                  <strong>{mode === "animal" && animalTarget ? animalTarget.label : cellLabel(cell, player)}</strong>
                  <small>{col},{row}</small>
                </button>
              );
            }),
          )}
        </div>
        {mode === "animal" ? (
          <div className="animal-placement-panel">
            <button
              className="secondary-button"
              disabled={!canCookAnimal(player) || cookedAnimals >= animalAmount - sumPlacements(animalPlacements)}
              onClick={() => setCookedAnimals((current) => Math.min(current + 1, animalAmount - sumPlacements(animalPlacements)))}
            >
              做成食物 +1
            </button>
            <button className="secondary-button" disabled={cookedAnimals <= 0} onClick={() => setCookedAnimals((current) => Math.max(0, current - 1))}>
              减少烹饪
            </button>
            <span>已安置 {sumPlacements(animalPlacements)}，烹饪 {cookedAnimals}，丢弃 {discardAnimals}</span>
          </div>
        ) : null}
        <div className="farm-action-summary">
          {mode === "fence"
            ? `选择围栏 ${selectedSegments.length} 条，消耗 ${selectedSegments.length} 木材；当前木材 ${player.resources.wood}，剩余围栏 ${availableFenceSlots}。`
            : mode === "room"
              ? `已选择 ${selectedCells.length} 间；本次需要 ${translateRoomMaterial(player.farm.roomMaterial)} ${roomCost.material}、芦苇 ${roomCost.reed}。库存：${translateRoomMaterial(player.farm.roomMaterial)} ${roomCost.availableMaterial}、芦苇 ${player.resources.reed}。`
              : mode === "animal"
              ? `获得 ${translateAnimal(animal)} ${animalAmount} 只。未安置的动物会被丢弃，拥有炉灶时可做成食物。`
              : `已选择 ${selectedCells.length} 格。`}
        </div>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onCancel}>取消</button>
          <button disabled={!canConfirm} onClick={() => onConfirm(input)}>确认行动</button>
        </footer>
      </section>
    </div>
  );
}

function pickFarmMode(effectTypes: string[], actionSpace: ActionSpaceState): FarmActionMode {
  if (hasAccumulatedAnimal(actionSpace)) return "animal";
  if (effectTypes.includes("buildFences")) return "fence";
  if (effectTypes.includes("sow")) return "sow";
  if (effectTypes.includes("buildRooms")) return "room";
  if (effectTypes.includes("buildStables") || effectTypes.includes("sideJob")) return "stable";
  if (effectTypes.includes("gainAnimal") || effectTypes.includes("gainMissingAnimal")) return "animal";
  return "field";
}

function createFarmActionInput(
  mode: FarmActionMode,
  effectTypes: string[],
  cells: Array<{ row: number; col: number }>,
  segments: FenceSegment[],
  crop: "grain" | "vegetable",
  animal: FarmAnimalType,
  placements: AnimalPlacementInput["placements"],
  cooked: number,
  discarded: number,
): ActionInput {
  const selectedEffectTypes = effectTypes.filter((type) => {
    if (mode === "field") return type === "plowField";
    if (mode === "room") return type === "buildRooms";
    if (mode === "stable") return type === "buildStables" || type === "sideJob";
    if (mode === "fence") return type === "buildFences";
    if (mode === "sow") return type === "sow";
    if (mode === "animal") return type === "gainAnimal" || type === "gainMissingAnimal";
    return false;
  });
  return {
    selectedEffectTypes,
    fieldCell: cells[0],
    roomCells: mode === "room" ? cells : undefined,
    stableCells: mode === "stable" ? cells : undefined,
    fenceSegments: mode === "fence" ? segments : undefined,
    sow: mode === "sow" ? [{ crop, cells }] : undefined,
    animalChoice: animal,
    animalPlacement: mode === "animal" ? { animal, placements, cooked, discarded } : undefined,
  };
}

function isCellValidForMode(
  mode: FarmActionMode,
  cell: PlayerState["farm"]["cells"][number] | undefined,
  player: PlayerState,
  selectedCells: Array<{ row: number; col: number }>,
): boolean {
  if (!cell) return false;
  if (mode === "field") return isEmptyBuildCell(cell) && canPlowCell(player, cell);
  if (mode === "room") return isEmptyBuildCell(cell) && canRoomTouchExistingOrSelected(player, cell, selectedCells);
  if (mode === "stable") return !cell.room && !cell.field && !cell.stable;
  if (mode === "sow") return Boolean(cell.field && !cell.field.crop && cell.field.count === 0);
  if (mode === "animal") return true;
  return false;
}

function cellLabel(cell: PlayerState["farm"]["cells"][number] | undefined, player?: PlayerState): string {
  if (!cell) return "空";
  if (cell.room) return "房";
  if (cell.field?.crop) return cell.field.crop === "grain" ? "麦" : "菜";
  if (cell.field) return "田";
  if (cell.pastureId) {
    const pasture = player?.farm.pastures.find((item) => item.id === cell.pastureId);
    return pasture?.animalType ? `${translateAnimal(pasture.animalType)}${pasture.animalCount}` : "牧";
  }
  if (cell.stable) return "厩";
  return "空";
}

function farmActionHelp(mode: FarmActionMode): string {
  if (mode === "fence") return "点击格子边缘放置围栏，形成封闭牧场。";
  if (mode === "sow") return "选择作物，再点击空田地播种，可以只播一部分。";
  if (mode === "animal") return "点击房屋、独立马厩或封闭牧场安置动物；放不下的动物会丢弃。";
  if (mode === "room") return "点击空地选择要建造的新房间；可以一次建多个，材料按房间数量翻倍。";
  if (mode === "stable") return "点击合法空地选择要建造的马厩。";
  return "点击空地选择要翻耕的田地；当前版本一次翻耕一块田。";
}

function pickAnimal(actionSpace: ActionSpaceState): FarmAnimalType | null {
  const text = `${actionSpace.id} ${actionSpace.name}`;
  if (text.toLowerCase().includes("boar") || text.includes("猪")) return "boar";
  if (text.toLowerCase().includes("cattle") || text.includes("牛")) return "cattle";
  if (text.toLowerCase().includes("sheep") || text.includes("羊")) return "sheep";
  return null;
}

function translateAnimal(animal: FarmAnimalType): string {
  if (animal === "boar") return "野猪";
  if (animal === "cattle") return "牛";
  return "羊";
}

function pickAnimalAmount(actionSpace: ActionSpaceState): number {
  const accumulatedAnimal = (["sheep", "boar", "cattle"] as FarmAnimalType[]).find((animal) => (actionSpace.accumulated[animal] ?? 0) > 0);
  if (accumulatedAnimal) return actionSpace.accumulated[accumulatedAnimal] ?? 1;
  return 1;
}

function isEmptyBuildCell(cell: PlayerState["farm"]["cells"][number]): boolean {
  return !cell.room && !cell.field && !cell.pastureId && !cell.stable;
}

function canPlowCell(player: PlayerState, cell: PlayerState["farm"]["cells"][number]): boolean {
  const fields = player.farm.cells.filter((item) => item.field);
  return fields.length === 0 || hasNeighbor(player, cell, (candidate) => Boolean(candidate.field));
}

function canRoomTouchExistingOrSelected(
  player: PlayerState,
  cell: PlayerState["farm"]["cells"][number],
  selectedCells: Array<{ row: number; col: number }>,
): boolean {
  return hasNeighbor(player, cell, (candidate) => candidate.room || selectedCells.some((selected) => selected.row === candidate.row && selected.col === candidate.col));
}

function hasNeighbor(
  player: PlayerState,
  cell: PlayerState["farm"]["cells"][number],
  predicate: (cell: PlayerState["farm"]["cells"][number]) => boolean,
): boolean {
  return player.farm.cells.some((candidate) => Math.abs(candidate.row - cell.row) + Math.abs(candidate.col - cell.col) === 1 && predicate(candidate));
}

function getAnimalTarget(player: PlayerState, row: number, col: number, animal: FarmAnimalType) {
  const cell = player.farm.cells.find((item) => item.row === row && item.col === col);
  if (!cell) return null;
  if (cell.room && player.farm.animalHousing.house.count === 0) {
    return { label: "房屋 1", capacity: 1, placement: { type: "house" as const, count: 1 } };
  }
  const stable = player.farm.animalHousing.stables.find((item) => item.row === row && item.col === col);
  if (stable && !cell.pastureId && (!stable.animal || stable.animal === animal) && stable.count < 1) {
    return { label: "马厩 1", capacity: 1 - stable.count, placement: { type: "stable" as const, row, col, count: 1 } };
  }
  const pasture = cell.pastureId ? player.farm.pastures.find((item) => item.id === cell.pastureId) : null;
  if (pasture && (!pasture.animalType || pasture.animalType === animal) && pasture.animalCount < pasture.capacity) {
    return {
      label: `牧场 ${pasture.capacity - pasture.animalCount}`,
      capacity: pasture.capacity - pasture.animalCount,
      placement: { type: "pasture" as const, pastureId: pasture.id, row, col, count: 1 },
    };
  }
  return null;
}

function placementKey(placement: AnimalPlacementInput["placements"][number]): string {
  if (placement.type === "house") return "house";
  if (placement.type === "stable") return `stable:${placement.row}:${placement.col}`;
  return `pasture:${placement.pastureId}`;
}

function sumPlacements(placements: AnimalPlacementInput["placements"]): number {
  return placements.reduce((sum, placement) => sum + placement.count, 0);
}

function canCookAnimal(player: PlayerState): boolean {
  return player.majorImprovements.some((id) => id.startsWith("fireplace") || id.startsWith("cooking-hearth"));
}

function calculateRoomCost(player: PlayerState, roomCount: number) {
  const materialKey = player.farm.roomMaterial === "wood" ? "wood" : player.farm.roomMaterial === "clay" ? "clay" : "stone";
  return {
    material: roomCount * 5,
    reed: roomCount * 2,
    materialKey,
    availableMaterial: player.resources[materialKey],
  };
}

function canPayRoomCost(player: PlayerState, roomCount: number): boolean {
  const cost = calculateRoomCost(player, roomCount);
  return cost.availableMaterial >= cost.material && player.resources.reed >= cost.reed;
}

function translateRoomMaterial(material: PlayerState["farm"]["roomMaterial"]): string {
  if (material === "clay") return "黏土";
  if (material === "stone") return "石头";
  return "木材";
}

function edgeToSegment(row: number, col: number, edge: FenceEdgeSide): FenceSegment {
  if (edge === "left") return { orientation: "vertical", row, col };
  if (edge === "right") return { orientation: "vertical", row, col: col + 1 };
  if (edge === "top") return { orientation: "horizontal", row, col };
  return { orientation: "horizontal", row: row + 1, col };
}

function segmentKey(segment: FenceSegment): string {
  return `${segment.orientation}:${segment.row}:${segment.col}`;
}

function hasFence(player: PlayerState, segment: FenceSegment): boolean {
  return (player.farm.fenceSegments ?? []).some((candidate) => segmentKey(candidate) === segmentKey(segment));
}

function isFenceSegmentBuildable(player: PlayerState, segment: FenceSegment): boolean {
  const adjacent = getSegmentAdjacentCells(player, segment);
  return adjacent.length > 0 && adjacent.every((cell) => !cell.room && !cell.field);
}

function getSegmentAdjacentCells(player: PlayerState, segment: FenceSegment): Array<PlayerState["farm"]["cells"][number]> {
  const positions =
    segment.orientation === "vertical"
      ? [
          { row: segment.row, col: segment.col - 1 },
          { row: segment.row, col: segment.col },
        ]
      : [
          { row: segment.row - 1, col: segment.col },
          { row: segment.row, col: segment.col },
        ];
  return positions
    .filter((position) => position.row >= 0 && position.col >= 0 && position.row < player.farm.rows && position.col < player.farm.cols)
    .map((position) => player.farm.cells.find((cell) => cell.row === position.row && cell.col === position.col))
    .filter((cell): cell is PlayerState["farm"]["cells"][number] => Boolean(cell));
}
