import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionEffect } from "../../../config/baseActions";
import { majorImprovements } from "../../../config/majorImprovements";
import { getMinorImprovement, getMinorImprovementResourceCost, minorImprovements, type ActionGroup, type CardRequirement, type MinorImprovementDefinition } from "../../../config/minorImprovements";
import { occupations, type OccupationDefinition } from "../../../config/occupations";
import { applyCardCostModifiers, countScoringCropFields, hasCardActionAccess } from "../../../shared/cardEffectUtils";
import { roundActionDefinitions } from "../../../config/roundCards";
import { harvestRounds } from "../../../config/scoringRules";
import type { ActionInput, AnimalPlacementInput } from "../../../shared/types";
import type { ActionSpaceState } from "../../../state/ActionSpaceState";
import type { FarmAnimalType, FenceSegment } from "../../../state/FarmState";
import type { PendingCardChoiceState } from "../../../state/GameState";
import type { PlayerState } from "../../../state/PlayerState";
import { placeWorker, submitCardChoice, toggleAdminActionSpaceOccupied } from "../../socket/clientSocket";
import { useGameStore } from "../../store/gameStore";
import { getAnimalCookOptions } from "../animalCooking";
import { ActionSpace } from "../ActionSpace/ActionSpace";
import { PlayableCardFace } from "../Cards/PlayableCard";
import { MajorFacilityMarket } from "../MajorFacilities/MajorFacilities";
import { RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";
import { getPlayerColorById } from "../VisualSystem/playerColors";

const emptyActionSpaces: ActionSpaceState[] = [];
const ROUND_CARD_SEASONS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6] as const;
const harvestRoundSet = new Set(harvestRounds);
const roundActionIds = new Set(roundActionDefinitions.map((action) => action.id));
const directEffectTypes = new Set(["takeAccumulated", "gainResource", "takeStartingPlayer", "familyGrowth", "renovate", "buildingSupplies"]);
const farmInteractionTypes = new Set(["plowField", "buildRooms", "buildStables", "buildFences", "sow", "gainAnimal", "gainMissingAnimal", "farmingSupplies", "sideJob"]);
type FarmActionMode = "field" | "room" | "stable" | "fence" | "sow" | "animal";
type ImprovementChoice = "major" | "minor" | "base";
type ActionChoiceMode = "all" | "one" | "any";
type CardPlayKind = "occupation" | "minor";
type ConfirmedSubAction = {
  id: string;
  label: string;
  input: ActionInput;
};
type ActionEffectChoice = {
  id: string;
  type: string;
  label: string;
  description?: string;
  mode: FarmActionMode | "direct" | "card" | "unsupported";
  effect: ActionEffect;
  childChoices: ActionEffectChoice[];
  disabled: boolean;
  disabledReason?: string;
};
type ScheduledRoundReward = {
  round: number;
  playerId: string;
  playerName: string;
  goods: Partial<Record<ResourceIconKey, number>>;
};

interface BoardProps {
  onSelfAction?: () => void;
}

export function Board({ onSelfAction }: BoardProps) {
  const { game, roomId, username, setNotice } = useGameStore();
  const actionSpaces = game?.actionSpaces ?? emptyActionSpaces;
  const visibleActionSpaces = actionSpaces.filter((actionSpace) => isVisibleActionSpace(actionSpace, username));
  const baseActionSpaces = visibleActionSpaces.filter((actionSpace) => !roundActionIds.has(actionSpace.id));
  const roundActionSpaces = visibleActionSpaces.filter((actionSpace) => roundActionIds.has(actionSpace.id));
  const currentPlayer = game?.players.find((player) => player.id === game.currentPlayer) ?? null;
  const adminTestPlayer = game?.players.find((player) => player.id === username) ?? null;
  const actorPlayer = roomId === "admin-test" ? adminTestPlayer : currentPlayer;
  const currentRound = game?.round ?? 0;
  const currentWorker = actorPlayer?.workers.find((worker) => worker.location === "home" && worker.availableRound <= currentRound);
  const isMyTurn = Boolean(game && username && game.phase === "WORK_PHASE" && game.currentPlayer === username);
  const isAdminTestRoom = roomId === "admin-test" && username === "admin";
  const canUseActionSpaces = isMyTurn || isAdminTestRoom;
  const currentPlayerColor = getPlayerColorById(game?.players ?? [], currentPlayer?.id);
  const pendingCardChoice = game?.pendingCardChoice && game.pendingCardChoice.playerId === username ? game.pendingCardChoice : null;
  const pendingCardChoicePlayer = pendingCardChoice ? game?.players.find((player) => player.id === pendingCardChoice.playerId) ?? null : null;
  const pendingCardChoiceAction = pendingCardChoice ? createPendingCardChoiceActionSpace(pendingCardChoice) : null;
  const [pendingAction, setPendingAction] = useState<{ actionSpace: ActionSpaceState; sourceElement: HTMLElement } | null>(null);
  const [majorFacilityAction, setMajorFacilityAction] = useState<{ actionSpace: ActionSpaceState; sourceElement?: HTMLElement } | null>(null);
  const [improvementChoiceAction, setImprovementChoiceAction] = useState<{ actionSpace: ActionSpaceState; sourceElement?: HTMLElement } | null>(null);
  const [cardPlayAction, setCardPlayAction] = useState<{ actionSpace: ActionSpaceState; kind: CardPlayKind; sourceElement?: HTMLElement } | null>(null);
  const [farmAction, setFarmAction] = useState<ActionSpaceState | null>(null);
  const previousScheduledRewards = useRef<ScheduledRoundReward[]>([]);

  useEffect(() => {
    if (!game) {
      previousScheduledRewards.current = [];
      return;
    }

    const currentRewards = collectScheduledRoundRewards(game.players);
    const dueRewards = previousScheduledRewards.current.filter((reward) => reward.round === game.round && !hasEquivalentScheduledReward(currentRewards, reward));
    if (game.phase === "WORK_PHASE" && dueRewards.length > 0) {
      window.setTimeout(() => animateScheduledRoundRewards(dueRewards, game.round), 120);
    }
    previousScheduledRewards.current = currentRewards;
  }, [game]);

  function handleActionClick(actionSpace: ActionSpaceState, sourceElement: HTMLElement) {
    if (!game || !roomId || !actorPlayer || (!currentWorker && !canUseCardActionWithoutWorker(actorPlayer, actionSpace))) {
      setNotice("当前没有可用工人。");
      return;
    }
    if (!canUseActionSpaces) {
      setNotice("还没有轮到你行动。");
      return;
    }
    if (actionSpace.occupiedBy && !isAdminTestRoom && !canUseOccupiedActionSpace(actorPlayer, actionSpace)) {
      setNotice("这个行动格已经被占用。");
      return;
    }
    if (requiresImprovementChoice(actionSpace)) {
      setImprovementChoiceAction({ actionSpace, sourceElement });
      return;
    }
    if (hasOccupationPlay(actionSpace)) {
      setCardPlayAction({ actionSpace, kind: "occupation", sourceElement });
      onSelfAction?.();
      return;
    }
    if (canFarmInteract(actionSpace)) {
      setFarmAction(actionSpace);
      onSelfAction?.();
      return;
    }
    if (canChoiceInteract(actionSpace, actorPlayer)) {
      setFarmAction(actionSpace);
      onSelfAction?.();
      return;
    }
    if (canDirectExecute(actionSpace, actorPlayer)) {
      if (hasMajorFacilityPurchase(actionSpace)) {
        setMajorFacilityAction({ actionSpace, sourceElement });
        return;
      }
      setPendingAction({ actionSpace, sourceElement });
      return;
    }
    setNotice("这个行动需要职业卡或设施选择，暂时不能执行。");
  }

  function executeAction(actionSpace: ActionSpaceState, input: ActionInput = {}, sourceElement?: HTMLElement) {
    if (!game || !roomId || !actorPlayer || (!currentWorker && !canUseCardActionWithoutWorker(actorPlayer, actionSpace))) return;
    if (sourceElement) {
      onSelfAction?.();
      window.setTimeout(() => animateActionResources(actionSpace, sourceElement, actorPlayer.id), 30);
    }
    window.setTimeout(() => {
      const usePendingActionAccess = Boolean(game.pendingActionAccess && game.pendingActionAccess.playerId === actorPlayer.id);
      placeWorker(roomId, actorPlayer.id, currentWorker?.id ?? `${actorPlayer.id}-card-action`, actionSpace.id, {
        ...input,
        usePendingActionAccess: usePendingActionAccess || input.usePendingActionAccess || undefined,
      });
    }, 180);
  }

  function toggleActionSpaceOccupied(actionSpaceId: string) {
    if (!roomId) return;
    toggleAdminActionSpaceOccupied(roomId, actionSpaceId);
  }

  return (
    <section className="panel board-panel">
      <header className="board-panel__header">
        <div>
          <h2>公共行动区</h2>
          <p className="muted">{isAdminTestRoom ? "测试房：可以连续点击行动格。" : isMyTurn ? "轮到你了，点击行动格执行。" : "等待当前玩家行动。"}</p>
        </div>
      </header>
      <div className="board-panel__turn board-panel__turn--top" style={{ ["--player-color" as string]: currentPlayerColor }}>
        <span className="turn-marker" aria-hidden="true" />
        <strong>轮到：{currentPlayer?.name ?? "等待玩家"}</strong>
        <span>{isAdminTestRoom ? "测试模式：无限派遣" : isMyTurn ? "点击行动格执行" : game?.phase === "WORK_PHASE" ? "等待对方行动" : "等待阶段推进"}</span>
      </div>
      <div className="action-space-grid">
        {baseActionSpaces.length === 0 ? (
          <p className="muted">暂无行动格。</p>
        ) : (
          baseActionSpaces.map((actionSpace) => (
            <ActionSpaceAdminWrap
              key={actionSpace.id}
              actionSpace={actionSpace}
              isAdminTestRoom={isAdminTestRoom}
              onToggleOccupied={toggleActionSpaceOccupied}
            >
              <ActionSpace
                actionSpace={actionSpace}
                isInteractive={canUseActionSpaces && (!actionSpace.occupiedBy || isAdminTestRoom || canUseOccupiedActionSpace(actorPlayer, actionSpace)) && (canDirectExecute(actionSpace, actorPlayer ?? undefined) || canFarmInteract(actionSpace) || canCardInteract(actionSpace, actorPlayer ?? undefined))}
                occupiedColor={getPlayerColorById(game?.players ?? [], actionSpace.occupiedBy)}
                onExecute={(sourceElement) => handleActionClick(actionSpace, sourceElement)}
              />
            </ActionSpaceAdminWrap>
          ))
        )}
      </div>
      <RoundCardBoard
        canUseActionSpaces={canUseActionSpaces}
        currentPlayer={actorPlayer}
        isAdminTestRoom={isAdminTestRoom}
        occupiedColorFor={(playerId) => getPlayerColorById(game?.players ?? [], playerId)}
        onActionClick={handleActionClick}
        onToggleOccupied={toggleActionSpaceOccupied}
        players={game?.players ?? []}
        roundActionSpaces={roundActionSpaces}
      />
      {pendingAction ? (
        <ConfirmActionOverlay
          actionSpace={pendingAction.actionSpace}
          player={actorPlayer}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            executeAction(pendingAction.actionSpace, createDirectActionInput(pendingAction.actionSpace), pendingAction.sourceElement);
            setPendingAction(null);
          }}
        />
      ) : null}
      {majorFacilityAction && game ? (
        <MajorFacilityMarket
          cardStates={game.majorImprovements}
          mode="buy"
          onBuy={(cardId, upgradeFromId) => {
            executeAction(
              majorFacilityAction.actionSpace,
              {
                majorImprovementId: cardId,
                upgradeFromId,
                selectedEffectTypes: createMajorFacilityActionTypes(majorFacilityAction.actionSpace),
                selectedEffectIds: createMajorFacilityActionIds(majorFacilityAction.actionSpace),
              },
              majorFacilityAction.sourceElement,
            );
            setMajorFacilityAction(null);
          }}
          optionalActionLabel={canExecuteWithoutBuyingMajorFacility(majorFacilityAction.actionSpace) && !requiresImprovementChoice(majorFacilityAction.actionSpace) ? "只执行翻修" : undefined}
          onOptionalAction={
            canExecuteWithoutBuyingMajorFacility(majorFacilityAction.actionSpace) && !requiresImprovementChoice(majorFacilityAction.actionSpace)
              ? () => {
                  executeAction(majorFacilityAction.actionSpace, createMajorFacilitySkipInput(majorFacilityAction.actionSpace), majorFacilityAction.sourceElement);
                  setMajorFacilityAction(null);
                }
              : undefined
          }
          onClose={() => setMajorFacilityAction(null)}
          player={actorPlayer}
        />
      ) : null}
      {improvementChoiceAction ? (
        <ImprovementChoiceOverlay
          actionSpace={improvementChoiceAction.actionSpace}
          player={actorPlayer}
          onCancel={() => setImprovementChoiceAction(null)}
          onSelect={(choice) => {
            if (choice === "major") {
              setMajorFacilityAction(improvementChoiceAction);
            }
            if (choice === "minor") {
              setCardPlayAction({ actionSpace: improvementChoiceAction.actionSpace, kind: "minor", sourceElement: improvementChoiceAction.sourceElement });
            }
            if (choice === "base") {
              executeAction(improvementChoiceAction.actionSpace, createImprovementBaseInput(improvementChoiceAction.actionSpace), improvementChoiceAction.sourceElement);
            }
            setImprovementChoiceAction(null);
          }}
        />
      ) : null}
      {farmAction && game && actorPlayer ? (
        <FarmActionOverlay
          actionSpace={farmAction}
          player={actorPlayer}
          onCancel={() => setFarmAction(null)}
          onConfirm={(input) => {
            executeAction(farmAction, input);
            setFarmAction(null);
          }}
        />
      ) : null}
      {pendingCardChoiceAction && pendingCardChoicePlayer && roomId ? (
        <FarmActionOverlay
          actionSpace={pendingCardChoiceAction}
          player={pendingCardChoicePlayer}
          onCancel={() => setNotice("请先完成卡牌触发的选择。")}
          onConfirm={(input) => submitCardChoice(roomId, pendingCardChoicePlayer.id, input)}
        />
      ) : null}
      {cardPlayAction && actorPlayer ? (
        <CardPlayOverlay
          actionSpace={cardPlayAction.actionSpace}
          kind={cardPlayAction.kind}
          onCancel={() => setCardPlayAction(null)}
          onConfirm={(input) => {
            executeAction(cardPlayAction.actionSpace, input, cardPlayAction.sourceElement);
            setCardPlayAction(null);
          }}
          player={actorPlayer}
        />
      ) : null}
    </section>
  );
}

function RoundCardBoard({
  canUseActionSpaces,
  currentPlayer,
  isAdminTestRoom,
  occupiedColorFor,
  onActionClick,
  onToggleOccupied,
  players,
  roundActionSpaces,
}: {
  canUseActionSpaces: boolean;
  currentPlayer: PlayerState | null;
  isAdminTestRoom: boolean;
  occupiedColorFor: (playerId: string | null) => string;
  onActionClick: (actionSpace: ActionSpaceState, sourceElement: HTMLElement) => void;
  onToggleOccupied: (actionSpaceId: string) => void;
  players: PlayerState[];
  roundActionSpaces: ActionSpaceState[];
}) {
  const scheduledRewards = collectScheduledRoundRewards(players);
  return (
    <section className="round-card-board" aria-label="季度行动卡">
      <header className="round-card-board__header">
        <h3>季度行动卡</h3>
        <p className="muted">每个季度内随机翻出；未翻出的牌先以季度数字占位。</p>
      </header>
      <div className="round-card-track">
        {ROUND_CARD_SEASONS.map((season, index) => {
          const actionSpace = roundActionSpaces[index];
          const round = index + 1;
          const roundRewards = scheduledRewards.filter((reward) => reward.round === round);
          return (
            <div key={`round-slot-${round}`} className="round-card-slot" data-round-slot={round}>
              {actionSpace ? (
                <ActionSpaceAdminWrap
                  actionSpace={actionSpace}
                  isAdminTestRoom={isAdminTestRoom}
                  onToggleOccupied={onToggleOccupied}
                >
                  <ActionSpace
                    actionSpace={actionSpace}
                    compact
                    isInteractive={canUseActionSpaces && (!actionSpace.occupiedBy || isAdminTestRoom || canUseOccupiedActionSpace(currentPlayer, actionSpace)) && (canDirectExecute(actionSpace, currentPlayer ?? undefined) || canFarmInteract(actionSpace) || canCardInteract(actionSpace, currentPlayer ?? undefined))}
                    occupiedColor={occupiedColorFor(actionSpace.occupiedBy)}
                    onExecute={(sourceElement) => onActionClick(actionSpace, sourceElement)}
                  />
                </ActionSpaceAdminWrap>
              ) : (
                <div className={`round-card-placeholder round-card-placeholder--season-${season}`}>
                  <span>第</span>
                  <strong>{season}</strong>
                  <span>季度</span>
                </div>
              )}
              {roundRewards.length > 0 ? <ScheduledRewardStack players={players} rewards={roundRewards} /> : null}
              {harvestRoundSet.has(round) ? <div className="round-card-harvest-mark">收获</div> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionSpaceAdminWrap({
  actionSpace,
  children,
  isAdminTestRoom,
  onToggleOccupied,
}: {
  actionSpace: ActionSpaceState;
  children: ReactNode;
  isAdminTestRoom: boolean;
  onToggleOccupied: (actionSpaceId: string) => void;
}) {
  return (
    <div className="action-space-admin-wrap">
      {children}
      {isAdminTestRoom ? (
        <button
          className="action-space-admin-toggle"
          onClick={(event) => {
            event.stopPropagation();
            onToggleOccupied(actionSpace.id);
          }}
          type="button"
        >
          {actionSpace.occupiedBy ? "清空占用" : "设为占用"}
        </button>
      ) : null}
    </div>
  );
}

function ScheduledRewardStack({ players, rewards }: { players: PlayerState[]; rewards: ScheduledRoundReward[] }) {
  return (
    <div className="round-card-scheduled-stack" aria-label="本回合待领取资源">
      {rewards.map((reward, index) => (
        <div
          key={`${reward.round}-${reward.playerId}-${index}-${describeScheduledGoods(reward.goods)}`}
          className="round-card-scheduled-reward"
          style={{ ["--player-color" as string]: getPlayerColorById(players, reward.playerId) }}
        >
          <span className="round-card-scheduled-reward__marker">{reward.playerName.slice(0, 1)}</span>
          <span className="round-card-scheduled-reward__goods">
            {Object.entries(reward.goods).map(([resource, count]) => {
              if (!isIconKey(resource) || !count) return null;
              const Icon = RESOURCE_ICONS[resource];
              return (
                <span key={resource} data-scheduled-resource={resource}>
                  <Icon size={16} />
                  <strong>{count}</strong>
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function canDirectExecute(actionSpace: ActionSpaceState, player?: PlayerState): boolean {
  if (actionSpace.type === "placeholder") return false;
  if (hasAccumulatedAnimal(actionSpace)) return false;
  return getActionEffectChoices(actionSpace, player).some((choice) => choiceHasExecutableDirectEffect(choice));
}

function canCardInteract(actionSpace: ActionSpaceState, player?: PlayerState): boolean {
  if (!player) return false;
  if (hasOccupationPlay(actionSpace)) return player.occupationHand.some((cardId) => Boolean(occupations.find((card) => card.id === cardId)));
  if (hasMinorImprovementPlay(actionSpace)) return player.minorImprovementHand.some((cardId) => {
    const card = minorImprovements.find((candidate) => candidate.id === cardId);
    return Boolean(card && canPlayMinorCard(player, card));
  });
  return false;
}

function canFarmInteract(actionSpace: ActionSpaceState): boolean {
  if (hasAccumulatedAnimal(actionSpace)) return true;
  const leafEffects = flattenEffects(actionSpace.effects);
  return leafEffects.some((effect) => farmInteractionTypes.has(effect.type));
}

function canChoiceInteract(actionSpace: ActionSpaceState, player?: PlayerState): boolean {
  if (actionSpace.type === "placeholder" || requiresImprovementChoice(actionSpace) || hasMajorFacilityPurchase(actionSpace)) return false;
  const choices = getActionEffectChoices(actionSpace, player);
  return choices.length > 1 && choices.some((choice) => !choice.disabled);
}

function canUseOccupiedActionSpace(player: PlayerState | null | undefined, actionSpace: ActionSpaceState): boolean {
  if (!player || !actionSpace.occupiedBy) return false;
  const selectedTypes = flattenEffects(actionSpace.effects).map((effect) => effect.type);
  return selectedTypes.includes("familyGrowth") && hasCardActionAccess(player, "occupiedFamilyGrowth");
}

function canUseCardActionWithoutWorker(player: PlayerState | null | undefined, actionSpace: ActionSpaceState): boolean {
  if (!player) return false;
  return flattenEffects(actionSpace.effects).some((effect) => effect.type === "buildFences") && hasCardActionAccess(player, "freeFenceAction");
}

function hasTriggeredCardBakeBread(player: PlayerState, actionSpace: ActionSpaceState, selectedEffectTypes: string[]): boolean {
  const groups = actionGroupsForAction(actionSpace.id, selectedEffectTypes);
  return [...player.occupations, ...player.minorImprovements].some((cardId) => {
    const effects = getMinorImprovement(cardId)?.effects ?? occupations.find((card) => card.id === cardId)?.effects ?? [];
    return effects.some((effect) => {
      if (effect.type !== "bakeBread" || effect.trigger !== "afterAction") return false;
      if (!effect.condition) return true;
      if (effect.condition.type === "actionGroup") return effect.condition.groups.some((group) => groups.includes(group));
      if (effect.condition.type === "actionId") return effect.condition.ids.includes(actionSpace.id);
      if (effect.condition.type === "bakeBreadUsed") return selectedEffectTypes.includes("bakeBread");
      return false;
    });
  });
}

function actionGroupsForAction(actionSpaceId: string, selectedEffectTypes: string[]): ActionGroup[] {
  const groups = new Set<ActionGroup>();
  const add = (...items: ActionGroup[]) => items.forEach((item) => groups.add(item));
  if (["forest", "five-grove", "five-riverbank-forest", "two-player-flex"].includes(actionSpaceId)) add("woodAccumulation");
  if (["clay-pit", "five-hollow"].includes(actionSpaceId)) add("clayAccumulation", "clayOrStoneAccumulation");
  if (["western-quarry", "eastern-quarry"].includes(actionSpaceId)) add("stoneAccumulation", "clayOrStoneAccumulation");
  if (actionSpaceId === "fishing") add("fishing");
  if (actionSpaceId === "day-laborer") add("dayLaborer");
  if (["farmland", "cultivation", "six-farming-supplies"].includes(actionSpaceId) || selectedEffectTypes.includes("plowField")) add("fieldActions", "plow");
  if (["grain-seeds", "vegetable-seeds"].includes(actionSpaceId)) add("grainSeeds", "fieldActions");
  if (["sow-bake", "cultivation"].includes(actionSpaceId) || selectedEffectTypes.includes("sow")) add("sow", "fieldActions");
  if (["lessons", "meeting-place", "five-lessons-copse", "five-lessons-family"].includes(actionSpaceId) || selectedEffectTypes.includes("playOccupation")) add("lessons");
  if (["sheep-market", "boar-market", "cattle-market", "five-animal-market", "three-four-flex", "two-player-flex", "six-corral"].includes(actionSpaceId)) add("animalMarket");
  if (["farm-expansion", "fencing", "house-redevelopment", "farm-redevelopment", "five-build-room-traveling", "fold-builder-action"].includes(actionSpaceId) || selectedEffectTypes.some((type) => ["buildRooms", "buildFences", "buildStables"].includes(type))) add("building");
  if (["fencing", "farm-expansion", "farm-redevelopment", "fold-builder-action"].includes(actionSpaceId) || selectedEffectTypes.includes("buildFences")) add("fences");
  if (["house-redevelopment", "farm-redevelopment"].includes(actionSpaceId) || selectedEffectTypes.includes("renovate")) add("renovation");
  if (["major-minor-improvement", "six-improvement"].includes(actionSpaceId) || selectedEffectTypes.includes("buyMajorImprovement")) add("majorImprovement");
  if (["major-minor-improvement", "six-improvement", "house-redevelopment", "family-growth-room"].includes(actionSpaceId) || selectedEffectTypes.includes("playMinorImprovement")) add("minorImprovement");
  if (["five-resource-market", "six-building-supplies"].includes(actionSpaceId)) add("resourceMarket");
  if (["five-build-room-traveling"].includes(actionSpaceId)) add("travelingPlayers");
  return [...groups];
}

function isVisibleActionSpace(actionSpace: ActionSpaceState, username: string | null): boolean {
  return actionSpace.visibility !== "private" || !actionSpace.ownerId || actionSpace.ownerId === username;
}

function flattenEffects(effects: ActionSpaceState["effects"]): Array<{ type: string }> {
  return effects.flatMap((effect) => ("effects" in effect && effect.effects ? flattenEffects(effect.effects) : [effect]));
}

function hasBuyMajorImprovement(actionSpace: ActionSpaceState): boolean {
  return flattenEffects(actionSpace.effects).some((effect) => effect.type === "buyMajorImprovement");
}

function hasMajorFacilityPurchase(actionSpace: ActionSpaceState): boolean {
  return flattenEffects(actionSpace.effects).some((effect) => effect.type === "buyMajorImprovement" || (effect.type === "renovate" && "allowMajorImprovement" in effect && effect.allowMajorImprovement));
}

function requiresImprovementChoice(actionSpace: ActionSpaceState): boolean {
  const leafEffects = flattenEffects(actionSpace.effects);
  return leafEffects.some((effect) => effect.type === "playMinorImprovement" || effect.type === "playMinorImprovementPlaceholder");
}

function hasOccupationPlay(actionSpace: ActionSpaceState): boolean {
  return flattenEffects(actionSpace.effects).some((effect) => effect.type === "playOccupation" || effect.type === "playOccupationPlaceholder");
}

function hasMinorImprovementPlay(actionSpace: ActionSpaceState): boolean {
  return flattenEffects(actionSpace.effects).some((effect) => effect.type === "playMinorImprovement" || effect.type === "playMinorImprovementPlaceholder");
}

function canExecuteWithoutBuyingMajorFacility(actionSpace: ActionSpaceState): boolean {
  return flattenEffects(actionSpace.effects).some((effect) => effect.type === "renovate" && "allowMajorImprovement" in effect && effect.allowMajorImprovement);
}

function createMajorFacilityActionTypes(actionSpace: ActionSpaceState): string[] {
  if (hasBuyMajorImprovement(actionSpace)) {
    const types = ["buyMajorImprovement"];
    if (requiresSelectedType(actionSpace, "buyMajorImprovement", "renovate")) types.unshift("renovate");
    return types;
  }
  if (canExecuteWithoutBuyingMajorFacility(actionSpace)) return ["renovate"];
  return createDirectActionInput(actionSpace).selectedEffectTypes ?? [];
}

function createMajorFacilityActionIds(actionSpace: ActionSpaceState): string[] {
  const choices = getActionEffectChoices(actionSpace);
  const targetType = hasBuyMajorImprovement(actionSpace) ? "buyMajorImprovement" : "renovate";
  const targetChoice = findChoiceByType(choices, targetType);
  const ids = targetChoice ? [targetChoice.id] : [];
  if (hasBuyMajorImprovement(actionSpace) && requiresSelectedType(actionSpace, "buyMajorImprovement", "renovate")) {
    const renovationChoice = findChoiceByType(choices, "renovate");
    if (renovationChoice) ids.unshift(renovationChoice.id);
  }
  return ids;
}

function createMajorFacilitySkipInput(actionSpace: ActionSpaceState): ActionInput {
  return {
    selectedEffectTypes: canExecuteWithoutBuyingMajorFacility(actionSpace) ? ["renovate"] : [],
    selectedEffectIds: createMajorFacilityActionIds(actionSpace),
  };
}

function createImprovementBaseInput(actionSpace: ActionSpaceState): ActionInput {
  const choices = getActionEffectChoices(actionSpace);
  const baseChoice = findChoiceByType(choices, "renovate") ?? findChoiceByType(choices, "familyGrowth");
  return baseChoice ? { selectedEffectTypes: [baseChoice.type], selectedEffectIds: [baseChoice.id] } : createDirectActionInput(actionSpace);
}

function createPendingCardChoiceActionSpace(choice: PendingCardChoiceState): ActionSpaceState {
  const firstAnimal = (["sheep", "boar", "cattle"] as FarmAnimalType[]).find((animal) => (choice.animals?.[animal] ?? 0) > 0) ?? "sheep";
  const firstAnimalAmount = choice.animals?.[firstAnimal] ?? 1;
  const effects: ActionEffect[] =
    choice.type === "gainAnimals"
      ? [{ id: "card-gain-animal", type: "gainAnimal", animal: firstAnimal, amount: firstAnimalAmount, label: "处理动物" }]
      : choice.type === "plowField"
        ? [{ id: "card-plow-field", type: "plowField", label: "翻田" }]
        : choice.type === "buildStable"
          ? [{ id: "card-build-stable", type: "buildStables", max: choice.stableAmount ?? 1, woodCost: 0, label: "建马厩" }]
          : [{
              id: "card-build-room-or-renovate",
              type: "chooseOne",
              label: "盖房间或翻修",
              effects: [
                { id: "card-build-room", type: "buildRooms", label: "盖房间" },
                { id: "card-renovate", type: "renovate", allowMajorImprovement: false, label: "翻修" },
              ],
            }];

  return {
    id: `pending-card-choice:${choice.id}`,
    name: choice.label,
    type: "choice",
    cost: choice.cost ?? {},
    gain: { ...(choice.resources ?? {}), ...(choice.animals ?? {}) },
    prerequisites: [],
    rules: ["卡牌触发效果，请选择具体执行方式。"],
    restrictions: [],
    occupiedBy: null,
    accumulated: {},
    effects,
  };
}

function isUnavailableCardEffect(type: string): boolean {
  return type === "playOccupationPlaceholder" || type === "playMinorImprovementPlaceholder";
}

function requiresSelectedType(actionSpace: ActionSpaceState, effectType: string, requiredType: string): boolean {
  return findEffectsByType(actionSpace.effects, effectType).some((effect) => effect.requiresSelectedEffectTypes?.includes(requiredType));
}

function findEffectsByType(effects: ActionSpaceState["effects"], type: string): ActionEffect[] {
  return effects.flatMap((effect) => {
    if ("effects" in effect && effect.effects) return findEffectsByType(effect.effects, type);
    return effect.type === type ? [effect] : [];
  });
}

function getActionChoiceMode(actionSpace: ActionSpaceState): ActionChoiceMode {
  const root = actionSpace.effects[0];
  if (actionSpace.effects.length === 1 && "effects" in root && root.effects) {
    if (root.type === "chooseOne") return "one";
    if (root.type === "chooseAny") return "any";
  }
  return "all";
}

function getActionEffectChoices(actionSpace: ActionSpaceState, player?: PlayerState): ActionEffectChoice[] {
  const root = actionSpace.effects[0];
  const effects = actionSpace.effects.length === 1 && "effects" in root && root.effects ? root.effects : actionSpace.effects;
  return effects.map((effect, index) => makeEffectChoice(effect, actionSpace, player, String(index)));
}

function makeEffectChoice(effect: ActionEffect, actionSpace: ActionSpaceState, player: PlayerState | undefined, fallbackId: string): ActionEffectChoice {
  const id = effect.id ?? effectKey(effect, fallbackId);
  const childChoices = "effects" in effect && effect.effects ? effect.effects.map((child, index) => makeEffectChoice(child, actionSpace, player, `${id}.${index}`)) : [];
  const type = effect.type;
  const disabled = isChoiceDisabled(effect, actionSpace, player, childChoices);
  return {
    id,
    type,
    label: effectLabel(effect, actionSpace),
    description: effect.description,
    mode: effectMode(effect, actionSpace),
    effect,
    childChoices,
    disabled,
    disabledReason: disabled ? disabledReason(type, actionSpace, player, effect) : undefined,
  };
}

function effectKey(effect: ActionEffect, fallbackId: string): string {
  if (effect.type === "gainAnimal") return `${effect.type}:${effect.animal}:${fallbackId}`;
  if (effect.type === "gainResource") return `${effect.type}:${effect.resource}:${fallbackId}`;
  return `${effect.type}:${fallbackId}`;
}

function initialSelectedEffectIds(choices: ActionEffectChoice[], choiceMode: ActionChoiceMode): string[] {
  const available = choices.filter((choice) => !choice.disabled);
  const requiredBySelection = new Set(available.flatMap((choice) => choice.effect.requiresSelectedEffectTypes ?? []));
  const requiredChoices = available.filter((choice) => requiredBySelection.has(choice.type));
  const appendRequired = (ids: string[]) => [...new Set([...requiredChoices.map((choice) => choice.id), ...ids])];
  if (choiceMode === "one") return available.slice(0, 1).map((choice) => choice.id);
  if (choiceMode === "any") return appendRequired(available.slice(0, 1).map((choice) => choice.id));
  return available.map((choice) => choice.id);
}

function isChoiceDisabled(effect: ActionEffect, actionSpace: ActionSpaceState, player?: PlayerState, childChoices: ActionEffectChoice[] = []): boolean {
  const type = effect.type;
  if (childChoices.length > 0) return childChoices.every((choice) => choice.disabled);
  if (isUnavailableCardEffect(type)) return true;
  if (type === "playOccupation") return !player || !player.occupationHand.some((cardId) => occupations.some((card) => card.id === cardId));
  if (type === "playMinorImprovement") return !player || !player.minorImprovementHand.some((cardId) => {
    const card = minorImprovements.find((candidate) => candidate.id === cardId);
    return Boolean(card && canPlayMinorCard(player, card));
  });
  if (type === "buyMajorImprovement") {
    const round = useGameStore.getState().game?.round ?? 0;
    return Boolean(effect.minimumRound && round < effect.minimumRound) || !firstAvailableMajorImprovementId(useGameStore.getState().game, player?.id);
  }
  if (type === "bakeBread") return !player || !canBakeBread(player);
  if (type === "renovate") return !player || !canRenovate(player);
  if (type === "gainAnimal" && (effect.foodDelta ?? 0) < 0) return !player || player.resources.food < Math.abs(effect.foodDelta ?? 0);
  return false;
}

function disabledReason(type: string, actionSpace: ActionSpaceState, player?: PlayerState, effect?: ActionEffect): string {
  if (type === "playOccupationPlaceholder") return "请选择职业卡";
  if (type === "playMinorImprovementPlaceholder") return "请选择小设施";
  if (type === "playOccupation") return "没有可打出的职业卡";
  if (type === "playMinorImprovement") return "没有可打出的小设施";
  if (type === "buyMajorImprovement" && effect?.type === "buyMajorImprovement" && effect.minimumRound && (useGameStore.getState().game?.round ?? 0) < effect.minimumRound) return `第 ${effect.minimumRound} 轮后才能购买大设施`;
  if (type === "buyMajorImprovement") return "没有可购买的大设施或资源不足";
  if (type === "bakeBread") return "需要拥有可烤面包的大设施";
  if (type === "renovate") return renovationPlan(player)?.reason ?? "不能翻修";
  if (type === "gainAnimal" && effect?.type === "gainAnimal" && (effect.foodDelta ?? 0) < 0) return `需要 ${Math.abs(effect.foodDelta ?? 0)} 个食物`;
  return actionSpace.name;
}

function effectMode(effect: ActionEffect, actionSpace?: ActionSpaceState): ActionEffectChoice["mode"] {
  if (effect.type === "chooseOne" || effect.type === "chooseAny") {
    const firstFarmChoice = effect.effects.find((candidate) => isFarmChoiceMode(effectMode(candidate, actionSpace)));
    return firstFarmChoice ? effectMode(firstFarmChoice, actionSpace) : effect.effects.some((candidate) => directEffectTypes.has(candidate.type)) ? "direct" : "card";
  }
  const type = effect.type;
  if (type === "takeAccumulated" && actionSpace && hasAccumulatedAnimal(actionSpace)) return "animal";
  if (type === "plowField") return "field";
  if (type === "buildRooms") return "room";
  if (type === "buildStables" || type === "sideJob") return "stable";
  if (type === "buildFences") return "fence";
  if (type === "sow") return "sow";
  if (type === "gainAnimal" || type === "gainMissingAnimal") return "animal";
  if (type === "buyMajorImprovement" || type === "playOccupation" || type === "playMinorImprovement" || type === "playOccupationPlaceholder" || type === "playMinorImprovementPlaceholder" || type === "bakeBread") return "card";
  if (directEffectTypes.has(type) || type === "buildingSupplies") return "direct";
  return "unsupported";
}

function isFarmChoiceMode(mode: ActionEffectChoice["mode"]): mode is FarmActionMode {
  return mode === "field" || mode === "room" || mode === "stable" || mode === "fence" || mode === "sow" || mode === "animal";
}

function choiceHasExecutableDirectEffect(choice: ActionEffectChoice): boolean {
  if (choice.disabled) return false;
  if (choice.childChoices.length > 0) {
    const executableChildren = choice.childChoices.filter((child) => choiceHasExecutableDirectEffect(child));
    if (executableChildren.length > 0) return true;
    return choice.childChoices.some((child) => child.disabled && child.effect.requiresSelectedEffectTypes?.some((type) => choice.childChoices.some((candidate) => candidate.type === type && !candidate.disabled)));
  }
  return directEffectTypes.has(choice.type) || choice.type === "buyMajorImprovement" || choice.type === "playOccupation" || choice.type === "playMinorImprovement";
}

function choiceRequiresSelectedEffect(choice: ActionEffectChoice): boolean {
  return Boolean(choice.effect.requiresSelectedEffectTypes?.length || choice.childChoices.some(choiceRequiresSelectedEffect));
}

function canUseSubActionConfirm(choiceMode: ActionChoiceMode, choices: ActionEffectChoice[]): boolean {
  return choiceMode === "any" && choices.filter((choice) => !choice.disabled).length > 1 && choices.every((choice) => !choiceRequiresSelectedEffect(choice));
}

function mergeActionInputs(inputs: ActionInput[]): ActionInput {
  const merged: ActionInput = {};
  const mergePositions = (current: Array<{ row: number; col: number }> | undefined, next: Array<{ row: number; col: number }> | undefined) => {
    const result = [...(current ?? [])];
    next?.forEach((position) => {
      if (!result.some((item) => item.row === position.row && item.col === position.col)) {
        result.push(position);
      }
    });
    return result.length > 0 ? result : undefined;
  };
  const mergeAnimalPlacement = (current: AnimalPlacementInput | undefined, next: AnimalPlacementInput | undefined) => {
    if (!current) return next;
    if (!next) return current;
    if (current.animal !== next.animal) return next;
    return {
      animal: current.animal,
      placements: [...current.placements, ...next.placements],
      cooked: (current.cooked ?? 0) + (next.cooked ?? 0) || undefined,
      discarded: (current.discarded ?? 0) + (next.discarded ?? 0) || undefined,
    };
  };

  inputs.forEach((input) => {
    merged.selectedEffectTypes = [...new Set([...(merged.selectedEffectTypes ?? []), ...(input.selectedEffectTypes ?? [])])];
    merged.selectedEffectIds = [...new Set([...(merged.selectedEffectIds ?? []), ...(input.selectedEffectIds ?? [])])];
    merged.fieldCell = input.fieldCell ?? merged.fieldCell;
    merged.roomCells = mergePositions(merged.roomCells, input.roomCells);
    merged.stableCells = mergePositions(merged.stableCells, input.stableCells);
    merged.pastureCells = mergePositions(merged.pastureCells, input.pastureCells);
    merged.fenceEdges = input.fenceEdges ?? merged.fenceEdges;
    merged.fenceSegments = input.fenceSegments ?? merged.fenceSegments;
    merged.sow = [...(merged.sow ?? []), ...(input.sow ?? [])];
    merged.majorImprovementId = input.majorImprovementId ?? merged.majorImprovementId;
    merged.occupationCardId = input.occupationCardId ?? merged.occupationCardId;
    merged.minorImprovementCardId = input.minorImprovementCardId ?? merged.minorImprovementCardId;
    merged.upgradeFromId = input.upgradeFromId ?? merged.upgradeFromId;
    merged.bake = input.bake ?? merged.bake;
    merged.cook = [...(merged.cook ?? []), ...(input.cook ?? [])];
    merged.animalChoice = input.animalChoice ?? merged.animalChoice;
    merged.animalPlacement = mergeAnimalPlacement(merged.animalPlacement, input.animalPlacement);
    merged.resourceChoices = input.resourceChoices ?? merged.resourceChoices;
    merged.farmingSupplies = input.farmingSupplies ?? merged.farmingSupplies;
    merged.overflowAnimalResolution = input.overflowAnimalResolution ?? merged.overflowAnimalResolution;
    merged.useCardActionAccess = merged.useCardActionAccess || input.useCardActionAccess || undefined;
  });

  return merged;
}

function previewPlayerAfterConfirmedSubActions(player: PlayerState, input: ActionInput): PlayerState {
  const cells = player.farm.cells.map((cell) => {
    if (input.fieldCell && cell.row === input.fieldCell.row && cell.col === input.fieldCell.col) {
      return { ...cell, field: { crop: null, count: 0 } };
    }
    if (input.roomCells?.some((position) => position.row === cell.row && position.col === cell.col)) {
      return { ...cell, room: true, roomMaterial: player.farm.roomMaterial };
    }
    if (input.stableCells?.some((position) => position.row === cell.row && position.col === cell.col)) {
      return { ...cell, stable: true };
    }
    const sowInput = input.sow?.find((sow) => sow.cells.some((position) => position.row === cell.row && position.col === cell.col));
    if (sowInput) {
      return { ...cell, field: { crop: sowInput.crop, count: sowInput.crop === "grain" ? 3 : 2 } };
    }
    return cell;
  });

  return {
    ...player,
    farm: {
      ...player.farm,
      cells,
    },
  };
}

function findChoiceById(choices: ActionEffectChoice[], id: string): ActionEffectChoice | undefined {
  for (const choice of choices) {
    if (choice.id === id) return choice;
    const child = findChoiceById(choice.childChoices, id);
    if (child) return child;
  }
  return undefined;
}

function findChoiceByType(choices: ActionEffectChoice[], type: string): ActionEffectChoice | undefined {
  for (const choice of choices) {
    if (choice.type === type) return choice;
    const child = findChoiceByType(choice.childChoices, type);
    if (child) return child;
  }
  return undefined;
}

function getActiveLeafChoice(choice: ActionEffectChoice | undefined, selectedNestedIds: string[]): ActionEffectChoice | undefined {
  if (!choice) return undefined;
  if (choice.childChoices.length === 0) return choice;
  return selectedNestedIds.map((id) => findChoiceById(choice.childChoices, id)).find((item): item is ActionEffectChoice => Boolean(item)) ?? choice.childChoices.find((item) => !item.disabled);
}

function selectedChoicesToTypes(choices: ActionEffectChoice[], selectedIds: string[], selectedNestedIds: string[]): string[] {
  return selectedChoicesToIds(choices, selectedIds, selectedNestedIds)
    .map((id) => findChoiceById(choices, id)?.type)
    .filter((type): type is string => Boolean(type));
}

function selectedChoicesToIds(choices: ActionEffectChoice[], selectedIds: string[], selectedNestedIds: string[]): string[] {
  return selectedIds.flatMap((id) => {
    const choice = findChoiceById(choices, id);
    if (!choice) return [];
    if (choice.childChoices.length === 0) return [choice.id];
    const selectedChildren = selectedNestedIds.filter((childId) => Boolean(findChoiceById(choice.childChoices, childId)));
    if (selectedChildren.length > 0) return selectedChildren;
    const fallback = choice.childChoices.find((child) => !child.disabled);
    return fallback ? [fallback.id] : [];
  });
}

function effectLabel(effect: ActionEffect, actionSpace: ActionSpaceState): string {
  if (effect.label) return effect.label;
  if (effect.type === "plowField") return "翻田";
  if (effect.type === "buildRooms") return "建房";
  if (effect.type === "buildStables") return "建马厩";
  if (effect.type === "buildFences") return "建围栏";
  if (effect.type === "sow") return "播种";
  if (effect.type === "bakeBread") return "烤面包";
  if (effect.type === "buyMajorImprovement") return "大设施";
  if (effect.type === "playMinorImprovement") return "小设施";
  if (effect.type === "playOccupation") return "职业卡";
  if (effect.type === "playMinorImprovementPlaceholder") return "小设施";
  if (effect.type === "playOccupationPlaceholder") return "职业卡";
  if (effect.type === "takeStartingPlayer") return "起始玩家";
  if (effect.type === "takeAccumulated") return actionSpace.name;
  if (effect.type === "gainResource") return actionSpace.name;
  if (effect.type === "gainAnimal") return effect.animal ? translateAnimal(effect.animal) : "动物";
  if (effect.type === "gainMissingAnimal") return "没有的动物";
  if (effect.type === "buildingSupplies") return "建筑资源";
  if (effect.type === "farmingSupplies") return "农耕补给";
  if (effect.type === "sideJob") return "副业";
  if (effect.type === "familyGrowth") return "生孩子";
  if (effect.type === "renovate") return "翻修";
  return effect.type;
}

function effectLabelForType(type: string): string {
  if (type === "takeAccumulated") return "拿取积累资源";
  if (type === "gainResource") return "获得资源";
  if (type === "takeStartingPlayer") return "起始玩家";
  if (type === "plowField") return "翻田";
  if (type === "buildRooms") return "建房";
  if (type === "buildStables") return "建马厩";
  if (type === "buildFences") return "建围栏";
  if (type === "sow") return "播种";
  if (type === "bakeBread") return "烤面包";
  if (type === "familyGrowth") return "生孩子";
  if (type === "renovate") return "翻修";
  if (type === "buildingSupplies") return "建筑资源";
  if (type === "buyMajorImprovement") return "大设施";
  if (type === "playMinorImprovement") return "小设施";
  if (type === "playOccupation") return "职业卡";
  return type;
}

function choiceHint(choice: ActionEffectChoice): string {
  const effect = choice.effect;
  if (effect.type === "gainAnimal" && effect.foodDelta) {
    return effect.foodDelta > 0 ? `获得 ${effect.foodDelta} 食物` : `需要 ${Math.abs(effect.foodDelta)} 食物`;
  }
  if (effect.type === "buildingSupplies" && effect.resources) {
    return `获得${describeResourceBundle(effect.resources)}`;
  }
  return choice.disabledReason ?? choice.description ?? "";
}

function describeResourceBundle(resources: Partial<Record<ResourceIconKey, number>>): string {
  return Object.entries(resources)
    .filter((entry): entry is [ResourceIconKey, number] => isIconKey(entry[0]) && entry[1] > 0)
    .map(([resource, amount]) => `${amount}${resourceLabel(resource)}`)
    .join("、");
}

function resourceLabel(resource: ResourceIconKey): string {
  const labels: Record<ResourceIconKey, string> = {
    wood: "木材",
    clay: "黏土",
    reed: "芦苇",
    stone: "石头",
    food: "食物",
    grain: "谷物",
    vegetable: "蔬菜",
    begging: "乞讨",
    starting: "起始",
    sheep: "羊",
    boar: "野猪",
    cattle: "牛",
    house: "房屋",
    field: "田地",
    pasture: "牧场",
    fence: "围栏",
    family: "家庭成员",
    stable: "马厩",
  };
  return labels[resource];
}

function actionLeadText(actionSpace: ActionSpaceState, choice?: ActionEffectChoice, fallback?: string, player?: PlayerState | null): string {
  if (flattenEffects(actionSpace.effects).some((effect) => effect.type === "renovate")) {
    const plan = renovationPlan(player);
    if (plan) return plan.ready ? `当前${plan.fromLabel}，将翻修为${plan.toLabel}；共 ${plan.roomCount} 间房，需要 ${plan.resourceLabel} ${plan.resourceAmount}、芦苇 ${plan.reedAmount}。必须一次全部翻修。` : plan.reason;
  }
  if (actionSpace.prerequisites.length > 0) return `条件：${actionSpace.prerequisites.join("；")}`;
  if (choice?.description) return choice.description;
  if (fallback) return fallback;
  return actionSpace.rules[0] ?? actionSpace.restrictions[0] ?? "确认后执行当前选择的行动。";
}

function pickAnimalFromChoice(choice: ActionEffectChoice | undefined): FarmAnimalType | null {
  const effect = choice?.effect;
  return effect?.type === "gainAnimal" ? effect.animal : null;
}

function findAnimalChoice(choices: ActionEffectChoice[], animal: FarmAnimalType): ActionEffectChoice | undefined {
  return choices.find((choice) => pickAnimalFromChoice(choice) === animal);
}

function getAvailableAnimals(choice: ActionEffectChoice | undefined, parentChoice: ActionEffectChoice | undefined, actionSpace: ActionSpaceState): FarmAnimalType[] {
  const selectedAnimal = pickAnimalFromChoice(choice);
  if (selectedAnimal) return [selectedAnimal];
  const childAnimals = parentChoice?.childChoices
    .map((child) => pickAnimalFromChoice(child))
    .filter((animal): animal is FarmAnimalType => Boolean(animal));
  if (childAnimals?.length) return childAnimals;
  const actionAnimal = pickAnimal(actionSpace);
  return actionAnimal ? [actionAnimal] : (["sheep", "boar", "cattle"] as FarmAnimalType[]);
}

function createDirectActionInput(actionSpace: ActionSpaceState): ActionInput {
  const choices = getActionEffectChoices(actionSpace).filter((choice) => !choice.disabled);
  const selected = choices.filter((choice) => directEffectTypes.has(choice.type) || choice.type === "buyMajorImprovement").map((choice) => choice.type);
  const selectedIds = choices.filter((choice) => directEffectTypes.has(choice.type) || choice.type === "buyMajorImprovement").map((choice) => choice.id);
  return selected.length > 0 ? { selectedEffectTypes: selected, selectedEffectIds: selectedIds } : {};
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
  const tokenSize = 24;
  const mount = document.createElement("div");
  mount.className = "flying-resource";
  mount.style.left = `${sourceRect.left + sourceRect.width / 2 - tokenSize / 2 + (index % 3) * 6}px`;
  mount.style.top = `${sourceRect.top + sourceRect.height / 2 - tokenSize / 2}px`;
  mount.style.setProperty("--fly-x", `${targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2}px`);
  mount.style.setProperty("--fly-y", `${targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2}px`);
  mount.innerHTML = iconMarkup;
  document.body.appendChild(mount);
  window.setTimeout(() => mount.remove(), 760);
}

function collectScheduledRoundRewards(players: PlayerState[]): ScheduledRoundReward[] {
  return players.flatMap((player) => {
    const foodRewards = (player.pendingFood ?? []).map((item) => ({
      round: item.round,
      playerId: player.id,
      playerName: player.name,
      goods: { food: item.amount } satisfies Partial<Record<ResourceIconKey, number>>,
    }));
    const goodRewards = (player.pendingGoods ?? []).map((item) => ({
      round: item.round,
      playerId: player.id,
      playerName: player.name,
      goods: normalizeScheduledGoods({ ...(item.resources ?? {}), ...(item.animals ?? {}) }),
    }));
    return [...foodRewards, ...goodRewards].filter((reward) => Object.keys(reward.goods).length > 0);
  });
}

function normalizeScheduledGoods(goods: Record<string, number | undefined>): Partial<Record<ResourceIconKey, number>> {
  return Object.entries(goods).reduce<Partial<Record<ResourceIconKey, number>>>((summary, [resource, amount]) => {
    if (!isIconKey(resource) || !amount || amount <= 0) return summary;
    summary[resource] = (summary[resource] ?? 0) + amount;
    return summary;
  }, {});
}

function hasEquivalentScheduledReward(rewards: ScheduledRoundReward[], reward: ScheduledRoundReward): boolean {
  return rewards.some(
    (candidate) =>
      candidate.round === reward.round &&
      candidate.playerId === reward.playerId &&
      describeScheduledGoods(candidate.goods) === describeScheduledGoods(reward.goods),
  );
}

function describeScheduledGoods(goods: Partial<Record<ResourceIconKey, number>>): string {
  return Object.entries(goods)
    .filter((entry): entry is [ResourceIconKey, number] => isIconKey(entry[0]) && entry[1] > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resource, count]) => `${resource}:${count}`)
    .join("|");
}

function animateScheduledRoundRewards(rewards: ScheduledRoundReward[], round: number): void {
  if (typeof document === "undefined") return;
  const source = document.querySelector(`[data-round-slot="${round}"]`);
  if (!(source instanceof HTMLElement)) return;
  const sourceRect = source.getBoundingClientRect();

  rewards.forEach((reward, rewardIndex) => {
    Object.entries(reward.goods).forEach(([resource, count]) => {
      if (!isIconKey(resource) || !count) return;
      const target = document.querySelector(`[data-resource-owner="${CSS.escape(reward.playerId)}"][data-resource="${resource}"]`);
      if (!(target instanceof HTMLElement)) return;
      const targetRect = target.getBoundingClientRect();
      const iconMarkup = createResourceIconMarkup(resource);
      const amount = Math.min(Math.max(count, 1), 12);
      for (let index = 0; index < amount; index += 1) {
        window.setTimeout(() => createFlyingToken(iconMarkup, sourceRect, targetRect, rewardIndex * 3 + index), index * 55 + rewardIndex * 90);
      }
    });
  });
}

function createResourceIconMarkup(resource: ResourceIconKey): string {
  const Icon = RESOURCE_ICONS[resource];
  return renderToStaticMarkup(<Icon size={24} />);
}

function isIconKey(value: string): value is ResourceIconKey {
  return value in RESOURCE_ICONS;
}

function ConfirmActionOverlay({ actionSpace, onCancel, onConfirm, player }: { actionSpace: ActionSpaceState; onCancel: () => void; onConfirm: () => void; player: PlayerState | null }) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal">
        <span className="game-modal__eyebrow">派遣工人</span>
        <h2>{actionSpace.name}</h2>
        <p>{actionLeadText(actionSpace, undefined, undefined, player)}</p>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onCancel}>取消</button>
          <button onClick={onConfirm}>确认执行</button>
        </footer>
      </section>
    </div>
  );
}

function ImprovementChoiceOverlay({
  actionSpace,
  onCancel,
  onSelect,
  player,
}: {
  actionSpace: ActionSpaceState;
  onCancel: () => void;
  onSelect: (choice: ImprovementChoice) => void;
  player: PlayerState | null;
}) {
  const hasRenovation = flattenEffects(actionSpace.effects).some((effect) => effect.type === "renovate");
  const hasFamilyGrowth = flattenEffects(actionSpace.effects).some((effect) => effect.type === "familyGrowth");
  const plan = hasRenovation ? renovationPlan(player) : null;
  const canPlayMinor = Boolean(player && player.minorImprovementHand.some((cardId) => {
    const card = minorImprovements.find((candidate) => candidate.id === cardId);
    return Boolean(card && canPlayMinorCard(player, card));
  }));

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal improvement-choice-modal">
        <span className="game-modal__eyebrow">设施选择</span>
        <h2>{actionSpace.name}</h2>
        {plan ? (
          <div className={`renovation-summary ${plan.ready ? "" : "renovation-summary--blocked"}`}>
            <strong>{plan.ready ? `${plan.fromLabel} → ${plan.toLabel}` : plan.reason}</strong>
            {plan.ready ? (
              <span>
                {plan.roomCount} 间房一次全部翻修，需要 {plan.resourceLabel} {plan.resourceAmount}、芦苇 {plan.reedAmount}
              </span>
            ) : null}
          </div>
        ) : hasFamilyGrowth ? (
          <p>必须先生孩子；新成员下轮开始可行动；之后可从手牌打出 1 张小设施。</p>
        ) : (
          <p>请选择本次要打出的设施类型。</p>
        )}
        <div className="improvement-choice-grid">
          {hasRenovation || hasFamilyGrowth ? (
            <button disabled={Boolean(plan && !plan.ready)} onClick={() => onSelect("base")}>
              {hasFamilyGrowth ? <RESOURCE_ICONS.family size={28} /> : <RESOURCE_ICONS.house size={28} />}
              <span>
                {hasFamilyGrowth ? "先生孩子" : "只翻修"}
                <small>{hasFamilyGrowth ? "执行生孩子，小设施暂不打出" : "执行翻修，小设施暂不打出"}</small>
              </span>
            </button>
          ) : null}
          {hasBuyMajorImprovement(actionSpace) ? (
            <button disabled={Boolean(plan && !plan.ready)} onClick={() => onSelect("major")}>
              <RESOURCE_ICONS.stone size={28} />
              <span>
                大设施
                <small>{hasRenovation ? "先翻修，再购买" : "购买 1 张大设施"}</small>
              </span>
            </button>
          ) : null}
          <button disabled={Boolean(plan && !plan.ready) || !canPlayMinor} title={canPlayMinor ? "选择小设施" : "没有可打出的小设施"} onClick={() => onSelect("minor")}>
            <RESOURCE_ICONS.wood size={28} />
            <span>
              小设施
              <small>{canPlayMinor ? (hasRenovation ? "先翻修，再打出" : hasFamilyGrowth ? "先生孩子，再打出" : "打出 1 张小设施") : "没有可打出的小设施"}</small>
            </span>
          </button>
        </div>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onCancel}>取消</button>
        </footer>
      </section>
    </div>
  );
}

function CardPlayOverlay({
  actionSpace,
  kind,
  onCancel,
  onConfirm,
  player,
}: {
  actionSpace: ActionSpaceState;
  kind: CardPlayKind;
  onCancel: () => void;
  onConfirm: (input: ActionInput) => void;
  player: PlayerState;
}) {
  const choiceMode = getActionChoiceMode(actionSpace);
  const directInput = createDirectActionInput(actionSpace);
  const directTypes = directInput.selectedEffectTypes ?? [];
  const canCombineDirect = kind === "occupation" && choiceMode === "any" && directTypes.length > 0;
  const canUseDirectInstead = kind === "occupation" && (choiceMode === "one" || choiceMode === "any") && directTypes.length > 0;
  const [includeDirect, setIncludeDirect] = useState(canCombineDirect);
  const cards =
    kind === "occupation"
      ? player.occupationHand.map((cardId) => occupations.find((card) => card.id === cardId)).filter((card): card is OccupationDefinition => Boolean(card))
      : player.minorImprovementHand.map((cardId) => minorImprovements.find((card) => card.id === cardId)).filter((card): card is MinorImprovementDefinition => Boolean(card));
  const directLabel = directTypes.map(effectLabelForType).join("、");

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal card-play-modal">
        <span className="game-modal__eyebrow">{kind === "occupation" ? "职业卡" : "小设施"}</span>
        <h2>{actionSpace.name}</h2>
        <p>{kind === "occupation" ? "选择 1 张职业卡打出；成本和结构化效果会立即结算。" : "选择 1 张小设施打出；成本、前置、印刷分、传递和结构化效果会按配置处理。"}</p>
        {canCombineDirect ? (
          <label className="card-play-toggle">
            <input type="checkbox" checked={includeDirect} onChange={(event) => setIncludeDirect(event.target.checked)} />
            同时执行：{directLabel}
          </label>
        ) : null}
        {canUseDirectInstead ? (
          <button className="secondary-button" onClick={() => onConfirm(directInput)}>
            只执行：{directLabel}
          </button>
        ) : null}
        <div className="card-play-list">
          {cards.length === 0 ? <p className="muted">当前没有可选择的{kind === "occupation" ? "职业卡" : "小设施"}。</p> : null}
          {cards.map((card) => {
            const disabled = kind === "minor" ? !canPlayMinorCard(player, card as MinorImprovementDefinition) : !canPayResourceCost(player, card.cost);
            const reason = kind === "minor" ? minorCardDisabledReason(player, card as MinorImprovementDefinition) : "资源不足";
            return (
              <button
                key={card.id}
                className="card-play-card"
                disabled={disabled}
                title={disabled ? reason : card.effectText}
                onClick={() => onConfirm(createCardPlayInput(actionSpace, kind, card.id, includeDirect && canCombineDirect))}
              >
                <CardPlayCardContent card={card} kind={kind} player={player} />
              </button>
            );
          })}
        </div>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onCancel}>取消</button>
        </footer>
      </section>
    </div>
  );
}

function CardPlayCardContent({
  card,
  kind,
  player,
}: {
  card: MinorImprovementDefinition | OccupationDefinition;
  kind: CardPlayKind;
  player: PlayerState;
}) {
  return (
    <PlayableCardFace
      card={card}
      kind={kind}
      footer={
        kind === "minor" && !canPlayMinorCard(player, card as MinorImprovementDefinition) ? (
          <span className="card-play-card__blocked">{minorCardDisabledReason(player, card as MinorImprovementDefinition)}</span>
        ) : (
          <span className="playable-card__status">可打出</span>
        )
      }
    />
  );
}

function createCardPlayInput(actionSpace: ActionSpaceState, kind: CardPlayKind, cardId: string, includeDirect: boolean): ActionInput {
  const choices = getActionEffectChoices(actionSpace);
  const targetType = kind === "occupation" ? "playOccupation" : "playMinorImprovement";
  const targetChoice = findChoiceByType(choices, targetType);
  const requiredChoices =
    targetChoice?.effect.requiresSelectedEffectTypes
      ?.map((type) => findChoiceByType(choices, type))
      .filter((choice): choice is ActionEffectChoice => Boolean(choice)) ?? [];
  const cardInput: ActionInput = {
    selectedEffectTypes: [...requiredChoices.map((choice) => choice.type), ...(targetChoice ? [targetChoice.type] : [])],
    selectedEffectIds: [...requiredChoices.map((choice) => choice.id), ...(targetChoice ? [targetChoice.id] : [])],
    occupationCardId: kind === "occupation" ? cardId : undefined,
    minorImprovementCardId: kind === "minor" ? cardId : undefined,
  };
  return includeDirect ? mergeActionInputs([createDirectActionInput(actionSpace), cardInput]) : cardInput;
}

function canPlayMinorCard(player: PlayerState, card: MinorImprovementDefinition): boolean {
  return canPayMinorCost(player, card) && card.requirements.every((requirement) => canSatisfyMinorRequirement(player, requirement));
}

function canPayMinorCost(player: PlayerState, card: MinorImprovementDefinition): boolean {
  return canPayResourceCost(player, applyCardCostModifiers(player, "minorImprovement", getMinorImprovementResourceCost(card, player.workers.length))) && canPayAnimalCost(player, card.animalCost);
}

function canPayResourceCost(player: PlayerState, cost: Partial<Record<string, number>>): boolean {
  return Object.entries(cost).every(([resource, amount]) => {
    if (!isPlayerResourceKey(resource)) return true;
    return player.resources[resource] >= (amount ?? 0);
  });
}

function canPayAnimalCost(player: PlayerState, cost: Partial<Record<string, number>>): boolean {
  return Object.entries(cost).every(([animal, amount]) => {
    if (!isPlayerAnimalKey(animal)) return true;
    return player.animals[animal] >= (amount ?? 0);
  });
}

function canSatisfyMinorRequirement(player: PlayerState, requirement: CardRequirement): boolean {
  const round = useGameStore.getState().game?.round ?? 0;
  if (requirement.type === "playedOccupationsAtLeast") return player.occupations.length >= requirement.count;
  if (requirement.type === "playedOccupationsAtMost") return player.occupations.length <= requirement.count;
  if (requirement.type === "playedOccupationsExactly") return player.occupations.length === requirement.count;
  if (requirement.type === "animalAtLeast") return player.animals[requirement.animal] >= requirement.count;
  if (requirement.type === "fieldsWithCropAtLeast") return countScoringCropFields(player, requirement.crop) >= requirement.count;
  if (requirement.type === "resourceAtLeast") return player.resources[requirement.resource] >= requirement.count;
  if (requirement.type === "roundAtMost") return round <= requirement.round;
  if (requirement.type === "roundAtLeast") return round >= requirement.round;
  if (requirement.type === "roomMaterialIn") return requirement.materials.includes(player.farm.roomMaterial);
  if (requirement.type === "emptyFieldsAtLeast") return player.farm.cells.filter((cell) => cell.field && !cell.field.crop && cell.field.count === 0).length >= requirement.count;
  if (requirement.type === "allFarmyardSpacesUsed") return player.farm.cells.every((cell) => cell.room || cell.field || cell.pastureId || cell.stable);
  if (requirement.type === "noAnimals") return player.animals.sheep === 0 && player.animals.boar === 0 && player.animals.cattle === 0;
  return true;
}

function minorCardDisabledReason(player: PlayerState, card: MinorImprovementDefinition): string {
  if (!canPayResourceCost(player, applyCardCostModifiers(player, "minorImprovement", getMinorImprovementResourceCost(card, player.workers.length)))) return `资源不足：需要 ${card.costText}`;
  if (!canPayAnimalCost(player, card.animalCost)) return `动物不足：需要 ${card.costText}`;
  const failedRequirement = card.requirements.find((requirement) => !canSatisfyMinorRequirement(player, requirement));
  return failedRequirement ? `不满足前置：${failedRequirement.text}` : "";
}

function isPlayerResourceKey(value: string): value is keyof PlayerState["resources"] {
  return ["wood", "clay", "reed", "stone", "grain", "vegetable", "food"].includes(value);
}

function isPlayerAnimalKey(value: string): value is keyof PlayerState["animals"] {
  return ["sheep", "boar", "cattle"].includes(value);
}

function RenovationSummary({ player }: { player: PlayerState }) {
  const plan = renovationPlan(player);
  if (!plan) return null;
  return (
    <div className={`renovation-summary ${plan.ready ? "" : "renovation-summary--blocked"}`}>
      <strong>{plan.ready ? `${plan.fromLabel} → ${plan.toLabel}` : plan.reason}</strong>
      {plan.ready ? (
        <span>
          必须一次翻修全部 {plan.roomCount} 间房；需要 {plan.resourceLabel} {plan.resourceAmount}、芦苇 {plan.reedAmount}。库存：{plan.resourceLabel} {plan.availableResource}、芦苇 {plan.availableReed}。
        </span>
      ) : null}
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
  const choices = useMemo(() => getActionEffectChoices(actionSpace, player), [actionSpace, player]);
  const choiceMode = getActionChoiceMode(actionSpace);
  const initialSelectedEffects = useMemo(() => initialSelectedEffectIds(choices, choiceMode), [choices, choiceMode]);
  const [selectedEffectIds, setSelectedEffectIds] = useState<string[]>(initialSelectedEffects);
  const [confirmedSubActions, setConfirmedSubActions] = useState<ConfirmedSubAction[]>([]);
  const confirmedEffectIds = new Set(confirmedSubActions.flatMap((item) => item.input.selectedEffectIds ?? []));
  const confirmedSowCrops = new Set(confirmedSubActions.flatMap((item) => (item.input.sow ?? []).map((sow) => sow.crop)));
  const isChoiceLocked = (choice: ActionEffectChoice) => (choice.type === "sow" ? confirmedSowCrops.has("grain") && confirmedSowCrops.has("vegetable") : confirmedEffectIds.has(choice.id));
  const activeEffectChoice =
    selectedEffectIds.map((id) => findChoiceById(choices, id)).find((choice): choice is ActionEffectChoice => Boolean(choice && isFarmChoiceMode(choice.mode) && !isChoiceLocked(choice))) ??
    selectedEffectIds.map((id) => findChoiceById(choices, id)).find((choice): choice is ActionEffectChoice => Boolean(choice && !isChoiceLocked(choice))) ??
    choices.find((choice) => !choice.disabled && !isChoiceLocked(choice)) ??
    choices[0];
  const [editingEffectId, setEditingEffectId] = useState(activeEffectChoice?.id ?? "");
  const effectiveEditingChoice = selectedEffectIds.includes(editingEffectId) ? findChoiceById(choices, editingEffectId) ?? activeEffectChoice : activeEffectChoice;
  const nestedChoiceMode = effectiveEditingChoice?.type === "chooseAny" ? "any" : "one";
  const [selectedNestedEffectIds, setSelectedNestedEffectIds] = useState<string[]>(
    effectiveEditingChoice?.childChoices?.length ? initialSelectedEffectIds(effectiveEditingChoice.childChoices, nestedChoiceMode) : [],
  );
  const activeLeafChoice = getActiveLeafChoice(effectiveEditingChoice, selectedNestedEffectIds);
  const activeChoiceUiMode = activeLeafChoice?.mode ?? effectiveEditingChoice?.mode ?? "unsupported";
  const needsFarmPicker = isFarmChoiceMode(activeChoiceUiMode);
  const selectedEffectTypes = selectedChoicesToTypes(choices, selectedEffectIds, selectedNestedEffectIds);
  const selectedFinalEffectIds = selectedChoicesToIds(choices, selectedEffectIds, selectedNestedEffectIds);
  const mode = needsFarmPicker ? pickFarmModeForEffect(activeLeafChoice?.effect ?? effectiveEditingChoice?.effect, actionSpace) : "field";
  const canConfirmSubAction = canUseSubActionConfirm(choiceMode, choices);
  const animalAmount = pickAnimalAmount(actionSpace, activeLeafChoice);
  const initialAnimal = pickAnimalFromChoice(activeLeafChoice) ?? pickAnimal(actionSpace) ?? "sheep";
  const availableAnimals = getAvailableAnimals(activeLeafChoice, effectiveEditingChoice, actionSpace);
  const [fieldCells, setFieldCells] = useState<Array<{ row: number; col: number }>>([]);
  const [roomCells, setRoomCells] = useState<Array<{ row: number; col: number }>>([]);
  const [stableCells, setStableCells] = useState<Array<{ row: number; col: number }>>([]);
  const [sowCells, setSowCells] = useState<Array<{ row: number; col: number }>>([]);
  const [selectedSegments, setSelectedSegments] = useState<FenceSegment[]>([]);
  const [crop, setCrop] = useState<"grain" | "vegetable">("grain");
  const [animal, setAnimal] = useState<FarmAnimalType>(initialAnimal);
  const [animalPlacements, setAnimalPlacements] = useState<AnimalPlacementInput["placements"]>([]);
  const [cookedAnimals, setCookedAnimals] = useState(0);
  const [manualDiscardAnimals, setManualDiscardAnimals] = useState(0);
  const animalCookOptions = useMemo(() => getAnimalCookOptions(player, animal), [player, animal]);
  const [cookImprovementId, setCookImprovementId] = useState<string>(() => animalCookOptions[0]?.id ?? "");
  const bakeOptions = useMemo(() => getBakeOptions(player), [player]);
  const [bakeImprovementId, setBakeImprovementId] = useState<string>(() => bakeOptions[0]?.id ?? "");
  const [bakeGrain, setBakeGrain] = useState(1);
  const [sideJobBakeEnabled, setSideJobBakeEnabled] = useState(false);
  const cardBakeAvailable = hasTriggeredCardBakeBread(player, actionSpace, selectedEffectTypes);

  const availableFenceSlots = Math.max(0, 15 - (player.farm.fencesUsed ?? player.farm.fences.length));
  const useFreeFenceAction = selectedEffectTypes.includes("buildFences") && hasCardActionAccess(player, "freeFenceAction");
  const roomCost = calculateRoomCost(player, roomCells.length);
  const handledAnimals = sumPlacements(animalPlacements) + cookedAnimals + manualDiscardAnimals;
  const remainingAnimals = Math.max(0, animalAmount - handledAnimals);
  const discardAnimals = manualDiscardAnimals;
  const activeBakeOption = bakeOptions.find((option) => option.id === bakeImprovementId) ?? bakeOptions[0] ?? null;
  const activeAnimalCookOption = animalCookOptions.find((option) => option.id === cookImprovementId) ?? animalCookOptions[0] ?? null;
  const maxCookAnimals = Math.max(0, animalAmount - sumPlacements(animalPlacements) - manualDiscardAnimals);
  const displayedCookFood = cookedAnimals * (activeAnimalCookOption?.foodPerAnimal ?? 0);
  const bakeMaxGrain = activeBakeOption ? Math.min(player.resources.grain, bakeOptionLimit(activeBakeOption)) : 0;
  const bakeEnabled = selectedEffectTypes.includes("bakeBread") || cardBakeAvailable || (selectedEffectTypes.includes("sideJob") && sideJobBakeEnabled);
  const displayedBakeGrain = bakeEnabled ? bakeGrain : 0;
  const displayedBakeFood = activeBakeOption ? displayedBakeGrain * activeBakeOption.foodPerGrain : 0;
  const showBakePanel = selectedEffectTypes.includes("bakeBread") || cardBakeAvailable || selectedEffectTypes.includes("sideJob");
  const input = createFarmActionInput(
    actionSpace,
    selectedEffectTypes,
    selectedFinalEffectIds,
    fieldCells,
    roomCells,
    stableCells,
    sowCells,
    selectedSegments,
    useFreeFenceAction,
    crop,
    animal,
    animalPlacements,
    bakeImprovementId,
    bakeGrain,
    bakeEnabled,
    cardBakeAvailable,
    cookedAnimals,
    cookImprovementId,
    discardAnimals,
  );
  const selectedGrainCells = selectedEffectTypes.includes("sow") && crop === "grain" ? sowCells.length : 0;
  const selectedVegetableCells = selectedEffectTypes.includes("sow") && crop === "vegetable" ? sowCells.length : 0;
  const currentStepReady =
    selectedEffectTypes.length > 0 &&
    !(canConfirmSubAction && mode === "sow" && confirmedSowCrops.has(crop)) &&
    selectedEffectTypes.every((type) => isSelectedEffectReady(type, player, input, availableFenceSlots, animalAmount, actionSpace));
  const finalInput = canConfirmSubAction ? mergeActionInputs(confirmedSubActions.map((item) => item.input)) : input;
  const previewPlayer = canConfirmSubAction ? previewPlayerAfterConfirmedSubActions(player, finalInput) : player;
  const canConfirm = canConfirmSubAction ? confirmedSubActions.length > 0 : currentStepReady;

  useEffect(() => {
    if (bakeOptions.length === 0) {
      setBakeImprovementId("");
      setBakeGrain(0);
      return;
    }
    if (!bakeOptions.some((option) => option.id === bakeImprovementId)) {
      setBakeImprovementId(bakeOptions[0].id);
      setBakeGrain(1);
    }
  }, [bakeOptions, bakeImprovementId]);

  useEffect(() => {
    if (!activeBakeOption) return;
    setBakeGrain((current) => clampNumber(current <= 0 ? 1 : current, 0, bakeMaxGrain));
  }, [activeBakeOption, bakeMaxGrain]);

  useEffect(() => {
    if (animalCookOptions.length === 0) {
      setCookImprovementId("");
      setCookedAnimals(0);
      return;
    }
    if (!animalCookOptions.some((option) => option.id === cookImprovementId)) {
      setCookImprovementId(animalCookOptions[0].id);
    }
  }, [animalCookOptions, cookImprovementId]);

  function toggleEffectId(id: string) {
    const choice = choices.find((item) => item.id === id);
    if (!choice || choice.disabled || isChoiceLocked(choice)) return;
    setSelectedEffectIds((current) => {
      if (canConfirmSubAction) {
        setEditingEffectId(id);
        resetNestedChoices(choice);
        resetCurrentDraft();
        return [id];
      }
      if (choiceMode === "one") {
        setEditingEffectId(id);
        resetNestedChoices(choice);
        return [id];
      }
      const exists = current.includes(id);
      const requiredByOthers = new Set(
        current
          .filter((item) => item !== id)
          .map((item) => findChoiceById(choices, item))
          .flatMap((item) => item?.effect.requiresSelectedEffectTypes ?? []),
      );
      if (exists && requiredByOthers.has(choice.type)) return current;
      const requiredChoiceIds = choice.effect.requiresSelectedEffectTypes
        ?.map((type) => findChoiceByType(choices, type))
        .filter((item): item is ActionEffectChoice => Boolean(item && !item.disabled))
        .map((item) => item.id) ?? [];
      const next = exists ? current.filter((item) => item !== id) : [...new Set([...current, ...requiredChoiceIds, id])];
      if (!exists) {
        setEditingEffectId(id);
        resetNestedChoices(choice);
      }
      return next;
    });
  }

  function resetNestedChoices(choice: ActionEffectChoice) {
    const mode = choice.type === "chooseAny" ? "any" : "one";
    const nestedIds = choice.childChoices.length ? initialSelectedEffectIds(choice.childChoices, mode) : [];
    setSelectedNestedEffectIds(nestedIds);
    const nestedChoice = nestedIds.length > 0 ? findChoiceById(choice.childChoices, nestedIds[0]) : undefined;
    const nextAnimal = pickAnimalFromChoice(nestedChoice) ?? pickAnimalFromChoice(choice) ?? animal;
    setAnimal(nextAnimal);
    setAnimalPlacements([]);
    setCookedAnimals(0);
    setManualDiscardAnimals(0);
    setCookImprovementId(getAnimalCookOptions(player, nextAnimal)[0]?.id ?? "");
  }

  function resetCurrentDraft() {
    if (mode === "field") setFieldCells([]);
    if (mode === "room") setRoomCells([]);
    if (mode === "stable") setStableCells([]);
    if (mode === "fence") setSelectedSegments([]);
    if (mode === "sow") setSowCells([]);
    if (mode === "animal") {
      setAnimalPlacements([]);
      setCookedAnimals(0);
      setManualDiscardAnimals(0);
      setCookImprovementId(getAnimalCookOptions(player, animal)[0]?.id ?? "");
    }
  }

  function confirmCurrentSubAction() {
    if (!canConfirmSubAction || !currentStepReady) return;
    const label = mode === "sow" ? `${effectLabelForType("sow")}：${crop === "grain" ? "谷物" : "蔬菜"} × ${sowCells.length}` : selectedEffectTypes.map((type) => effectLabelForType(type)).join("、");
    setConfirmedSubActions((current) => [...current, { id: `${Date.now()}:${current.length}`, label, input }]);
    const nextChoice = choices.find((choice) => !choice.disabled && (choice.type === "sow" || !selectedFinalEffectIds.includes(choice.id)) && !isChoiceLocked(choice));
    setSelectedEffectIds(nextChoice ? [nextChoice.id] : []);
    if (nextChoice) {
      setEditingEffectId(nextChoice.id);
      resetNestedChoices(nextChoice);
    }
    if (mode === "sow") {
      setCrop(crop === "grain" && !confirmedSowCrops.has("vegetable") ? "vegetable" : "grain");
    }
    resetCurrentDraft();
  }

  function toggleNestedEffectId(id: string) {
    if (!effectiveEditingChoice) return;
    const choice = effectiveEditingChoice.childChoices.find((item) => item.id === id);
    if (!choice || choice.disabled) return;
    setSelectedNestedEffectIds((current) => {
      if (nestedChoiceMode === "one") {
        const nextAnimal = pickAnimalFromChoice(choice) ?? animal;
        setAnimal(nextAnimal);
        setAnimalPlacements([]);
        setCookedAnimals(0);
        setManualDiscardAnimals(0);
        setCookImprovementId(getAnimalCookOptions(player, nextAnimal)[0]?.id ?? "");
        return [id];
      }
      const exists = current.includes(id);
      return exists ? current.filter((item) => item !== id) : [...current, id];
    });
  }

  function toggleCell(row: number, col: number) {
    const key = `${row}:${col}`;
    const update = (current: Array<{ row: number; col: number }>, single = false) => {
      if (current.some((cell) => `${cell.row}:${cell.col}` === key)) {
        return current.filter((cell) => `${cell.row}:${cell.col}` !== key);
      }
      if (single) {
        return [{ row, col }];
      }
      return [...current, { row, col }];
    };
    if (mode === "field") setFieldCells((current) => update(current, true));
    if (mode === "room") setRoomCells((current) => update(current));
    if (mode === "stable") setStableCells((current) => update(current));
    if (mode === "sow") setSowCells((current) => update(current));
  }

  function toggleSegment(segment: FenceSegment) {
    const key = segmentKey(segment);
    setSelectedSegments((current) => (current.some((item) => segmentKey(item) === key) ? current.filter((item) => segmentKey(item) !== key) : [...current, segment]));
  }

  function toggleAnimalPlacement(placement: AnimalPlacementInput["placements"][number], capacity: number) {
    setAnimalPlacements((current) => {
      const key = placementKey(placement);
      const existing = current.find((item) => placementKey(item) === key);
      const alreadyPlaced = sumPlacements(current);
      const availableForPlacement = animalAmount - cookedAnimals - manualDiscardAnimals - alreadyPlaced;
      if (existing) {
        if (capacity > 0 && availableForPlacement > 0) {
          return current.map((item) => (placementKey(item) === key ? { ...item, count: item.count + 1 } : item));
        }
        return current.filter((item) => placementKey(item) !== key);
      }
      const count = Math.min(1, capacity, availableForPlacement);
      if (count <= 0) return current;
      return [...current, { ...placement, count }];
    });
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal farm-action-modal">
        <span className="game-modal__eyebrow">{needsFarmPicker ? "农场行动" : "行动选择"}</span>
        <h2>{actionSpace.name}</h2>
        <p>{actionLeadText(actionSpace, activeLeafChoice ?? effectiveEditingChoice, needsFarmPicker ? farmActionHelp(mode) : undefined, player)}</p>
        {choices.length > 1 ? (
          <div className={`effect-choice-row effect-choice-row--${choiceMode}`}>
            {choices.map((choice) => {
              const active = selectedEffectIds.includes(choice.id);
              const confirmed = isChoiceLocked(choice);
              return (
                <button
                  key={choice.id}
                  type="button"
                  className={`${active ? "active" : ""} ${effectiveEditingChoice?.id === choice.id ? "editing" : ""} ${confirmed ? "confirmed" : ""}`}
                  disabled={choice.disabled || confirmed}
                  title={confirmed ? "已确认本小行动" : choice.disabledReason}
                  onClick={() => toggleEffectId(choice.id)}
                  onDoubleClick={() => active && setEditingEffectId(choice.id)}
                >
                  {choice.label}
                  <small>{confirmed ? "已确认" : choiceHint(choice)}</small>
                </button>
              );
            })}
          </div>
        ) : null}
        {effectiveEditingChoice?.childChoices.length ? (
          <div className={`effect-choice-row effect-choice-row--nested effect-choice-row--${nestedChoiceMode}`}>
            {effectiveEditingChoice.childChoices.map((choice) => {
              const active = selectedNestedEffectIds.includes(choice.id);
              return (
                <button
                  key={choice.id}
                  type="button"
                  className={active ? "active" : ""}
                  disabled={choice.disabled}
                  title={choice.disabledReason}
                  onClick={() => toggleNestedEffectId(choice.id)}
                >
                  {choice.label}
                  <small>{choiceHint(choice)}</small>
                </button>
              );
            })}
          </div>
        ) : null}
        {canConfirmSubAction && confirmedSubActions.length > 0 ? (
          <div className="confirmed-sub-actions">
            <strong>已确认小行动</strong>
            {confirmedSubActions.map((item) => (
              <span key={item.id}>{item.label}</span>
            ))}
          </div>
        ) : null}
        {showBakePanel ? (
          <div className="bake-panel">
            <div className="bake-panel__header">
              <strong>烤面包</strong>
              {activeBakeOption ? (
                <span>
                  当前大设施：{activeBakeOption.name}，每个谷物 → {activeBakeOption.foodPerGrain} 食物，{bakeOptionHint(activeBakeOption)}
                </span>
              ) : (
                <span className="muted">没有可烤面包的大设施</span>
              )}
            </div>
            {selectedEffectTypes.includes("sideJob") ? (
              <label className="bake-panel__toggle">
                <input disabled={!activeBakeOption} type="checkbox" checked={sideJobBakeEnabled && Boolean(activeBakeOption)} onChange={(event) => setSideJobBakeEnabled(event.target.checked)} />
                <span>同时烤面包</span>
              </label>
            ) : null}
            <div className="bake-panel__options">
              {bakeOptions.length > 1
                ? bakeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={option.id === bakeImprovementId ? "active" : ""}
                      onClick={() => {
                        setBakeImprovementId(option.id);
                        setBakeGrain((current) => clampNumber(current <= 0 ? 1 : current, 0, Math.min(player.resources.grain, bakeOptionLimit(option))));
                      }}
                    >
                      {option.name}
                      <small>
                        <RESOURCE_ICONS.grain size={14} /> × 1 → <RESOURCE_ICONS.food size={14} /> × {option.foodPerGrain}
                        ，{bakeOptionHint(option)}
                      </small>
                    </button>
                  ))
                : bakeOptions.length === 1
                  ? (
                    <div className="bake-panel__current">
                      <RESOURCE_ICONS.grain size={16} /> {activeBakeOption?.name}
                    </div>
                  )
                  : <div className="bake-panel__empty">没有可用的大设施</div>}
            </div>
            <label className="bake-panel__input">
              <span>
                <RESOURCE_ICONS.grain size={18} /> 烤制谷物
                <small>剩余 {player.resources.grain} 个</small>
              </span>
              <input
                disabled={!activeBakeOption || !bakeEnabled}
                max={bakeMaxGrain}
                min="0"
                type="number"
                value={bakeGrain}
                onChange={(event) => setBakeGrain(clampNumber(Number(event.target.value), 0, bakeMaxGrain))}
              />
            </label>
            <div className="bake-panel__summary">
              <span>
                <RESOURCE_ICONS.grain size={16} /> × {displayedBakeGrain}
              </span>
              <span className="major-facility-arrow">→</span>
              <span>
                <RESOURCE_ICONS.food size={16} /> × {displayedBakeFood}
              </span>
            </div>
          </div>
        ) : null}
        {needsFarmPicker && mode === "sow" ? (
          <div className="segmented">
            <button className={crop === "grain" ? "active" : ""} disabled={confirmedSowCrops.has("grain")} onClick={() => setCrop("grain")}>谷物 {player.resources.grain}</button>
            <button className={crop === "vegetable" ? "active" : ""} disabled={confirmedSowCrops.has("vegetable")} onClick={() => setCrop("vegetable")}>蔬菜 {player.resources.vegetable}</button>
          </div>
        ) : null}
        {needsFarmPicker && mode === "animal" ? (
          <div className="segmented">
            {availableAnimals.map((item) => {
              const animalChoice = findAnimalChoice(effectiveEditingChoice?.childChoices ?? choices, item);
              return (
                <button
                  key={item}
                  className={animal === item ? "active" : ""}
                  disabled={animalChoice?.disabled}
                  title={animalChoice?.disabledReason}
                  onClick={() => {
                    setAnimal(item);
                    setAnimalPlacements([]);
                    setCookedAnimals(0);
                    setManualDiscardAnimals(0);
                  }}
                >
                  {translateAnimal(item)} × {animalAmount}
                  {animalChoice ? <small>{choiceHint(animalChoice)}</small> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {needsFarmPicker && mode === "room" ? (
          <div className="room-cost-panel">
            <span>木屋：每间 5 木材 + 2 芦苇</span>
            <span>瓦房：每间 5 黏土 + 2 芦苇</span>
            <span>石头房：每间 5 石头 + 2 芦苇</span>
          </div>
        ) : null}
        {selectedEffectTypes.includes("renovate") ? <RenovationSummary player={player} /> : null}
        {needsFarmPicker ? (
          <div className={`farm-picker farm-picker--${mode}`}>
            {Array.from({ length: 3 }, (_, row) =>
              Array.from({ length: 5 }, (_, col) => {
                const cell = previewPlayer.farm.cells.find((candidate) => candidate.row === row && candidate.col === col);
                const cellsForMode = getCellsForMode(mode, fieldCells, roomCells, stableCells, sowCells);
                const selected = cellsForMode.some((item) => item.row === row && item.col === col);
                const valid = mode === "fence" || isCellValidForMode(mode, cell, previewPlayer, cellsForMode);
                const animalTarget = mode === "animal" ? getAnimalTarget(previewPlayer, row, col, animal, animalPlacements) : null;
                const animalSelected = animalTarget ? animalPlacements.some((item) => placementKey(item) === placementKey(animalTarget.placement)) : false;
                const animalSelectedCount = animalTarget ? placementCount(animalPlacements, animalTarget.placement) : 0;
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
                    <strong>{mode === "animal" && animalTarget ? animalPlacementLabel(animalTarget, animalSelectedCount) : cellLabel(cell, previewPlayer)}</strong>
                    <small>{col},{row}</small>
                  </button>
                );
              }),
            )}
            {mode === "fence" ? (
              <FenceStickPickerLayer
                player={player}
                selectedSegments={selectedSegments}
                onToggle={toggleSegment}
              />
            ) : null}
          </div>
        ) : null}
        {needsFarmPicker && mode === "animal" ? (
          <div className="animal-placement-panel">
            {animalCookOptions.length > 0 ? (
              <div className="animal-cook-options">
                {animalCookOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`secondary-button ${option.id === cookImprovementId ? "active" : ""}`}
                    onClick={() => setCookImprovementId(option.id)}
                  >
                    {option.name}
                    <small>每只 +{option.foodPerAnimal} 食物</small>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              className="secondary-button"
              disabled={!activeAnimalCookOption || maxCookAnimals <= 0}
              onClick={() => setCookedAnimals((current) => Math.min(current + 1, maxCookAnimals))}
            >
              做成食物 +1
            </button>
            <button className="secondary-button" disabled={cookedAnimals <= 0} onClick={() => setCookedAnimals((current) => Math.max(0, current - 1))}>
              减少烹饪
            </button>
            <button
              className="secondary-button"
              disabled={remainingAnimals <= 0}
              onClick={() => setManualDiscardAnimals((current) => Math.min(current + 1, animalAmount - sumPlacements(animalPlacements) - cookedAnimals))}
            >
              丢弃 +1
            </button>
            <button className="secondary-button" disabled={manualDiscardAnimals <= 0} onClick={() => setManualDiscardAnimals((current) => Math.max(0, current - 1))}>
              减少丢弃
            </button>
            <span>已安置 {sumPlacements(animalPlacements)}，烹饪 {cookedAnimals}（+{displayedCookFood} 食物），丢弃 {discardAnimals}，待处理 {remainingAnimals}</span>
          </div>
        ) : null}
        <div className="farm-action-summary">
          {!needsFarmPicker
            ? `将执行：${selectedEffectTypes.map((type) => effectLabelForType(type)).join("、") || actionSpace.name}。`
            : mode === "fence"
            ? `选择围栏 ${selectedSegments.length} 条，${useFreeFenceAction ? "通过牧场看守免放工人执行" : `消耗 ${selectedSegments.length} 木材`}；当前木材 ${player.resources.wood}，剩余围栏 ${availableFenceSlots}。`
            : mode === "room"
              ? `已选择 ${roomCells.length} 间；本次需要 ${translateRoomMaterial(player.farm.roomMaterial)} ${roomCost.material}、芦苇 ${roomCost.reed}。库存：${translateRoomMaterial(player.farm.roomMaterial)} ${roomCost.availableMaterial}、芦苇 ${player.resources.reed}。`
              : mode === "animal"
              ? `获得 ${translateAnimal(animal)} ${animalAmount} 只；还需处理 ${remainingAnimals} 只。`
              : `已选择 ${getCellsForMode(mode, fieldCells, roomCells, stableCells, sowCells).length} 格。`}
        </div>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onCancel}>取消</button>
          {canConfirmSubAction ? (
            <button className="secondary-button" disabled={!currentStepReady} onClick={confirmCurrentSubAction}>确认当前小行动</button>
          ) : null}
          <button disabled={!canConfirm} onClick={() => onConfirm(finalInput)}>{canConfirmSubAction ? "结束行动" : "确认行动"}</button>
        </footer>
      </section>
    </div>
  );
}

function pickFarmModeForEffect(effect: ActionEffect | undefined, actionSpace: ActionSpaceState): FarmActionMode {
  if (hasAccumulatedAnimal(actionSpace)) return "animal";
  if (effect?.type === "buildFences") return "fence";
  if (effect?.type === "sow") return "sow";
  if (effect?.type === "buildRooms") return "room";
  if (effect?.type === "buildStables" || effect?.type === "sideJob") return "stable";
  if (effect?.type === "gainAnimal" || effect?.type === "gainMissingAnimal") return "animal";
  return "field";
}

function createFarmActionInput(
  actionSpace: ActionSpaceState,
  selectedEffectTypes: string[],
  selectedEffectIds: string[],
  fieldCells: Array<{ row: number; col: number }>,
  roomCells: Array<{ row: number; col: number }>,
  stableCells: Array<{ row: number; col: number }>,
  sowCells: Array<{ row: number; col: number }>,
  segments: FenceSegment[],
  useFreeFenceAction: boolean,
  crop: "grain" | "vegetable",
  animal: FarmAnimalType,
  placements: AnimalPlacementInput["placements"],
  bakeImprovementId: string,
  bakeGrain: number,
  bakeEnabled: boolean,
  cardBakeAvailable: boolean,
  cooked: number,
  cookImprovementId: string,
  discarded: number,
): ActionInput {
  const needsAnimalPlacement = selectedEffectTypes.includes("gainAnimal") || selectedEffectTypes.includes("gainMissingAnimal") || selectedEffectTypes.some((type) => type === "takeAccumulated" && hasAccumulatedAnimal(actionSpace));
  return {
    selectedEffectTypes,
    selectedEffectIds,
    fieldCell: selectedEffectTypes.includes("plowField") ? fieldCells[0] : undefined,
    roomCells: selectedEffectTypes.includes("buildRooms") ? roomCells : undefined,
    stableCells: selectedEffectTypes.includes("buildStables") || selectedEffectTypes.includes("sideJob") ? stableCells : undefined,
    fenceSegments: selectedEffectTypes.includes("buildFences") ? segments : undefined,
    useCardActionAccess: useFreeFenceAction || undefined,
    sow: selectedEffectTypes.includes("sow") ? [{ crop, cells: sowCells }] : undefined,
    animalChoice: animal,
    animalPlacement: needsAnimalPlacement ? { animal, placements, cooked, cookImprovementId: cooked > 0 ? cookImprovementId : undefined, discarded } : undefined,
    bake: (selectedEffectTypes.includes("bakeBread") || cardBakeAvailable || (selectedEffectTypes.includes("sideJob") && bakeEnabled)) && bakeImprovementId && bakeGrain > 0 ? { improvementId: bakeImprovementId, grain: bakeGrain } : undefined,
  };
}

function getCellsForMode(
  mode: FarmActionMode,
  fieldCells: Array<{ row: number; col: number }>,
  roomCells: Array<{ row: number; col: number }>,
  stableCells: Array<{ row: number; col: number }>,
  sowCells: Array<{ row: number; col: number }>,
) {
  if (mode === "field") return fieldCells;
  if (mode === "room") return roomCells;
  if (mode === "stable") return stableCells;
  if (mode === "sow") return sowCells;
  return [];
}

function isSelectedEffectReady(type: string, player: PlayerState, input: ActionInput, availableFenceSlots: number, animalAmount: number, actionSpace: ActionSpaceState): boolean {
  if (type === "plowField") return Boolean(input.fieldCell);
  if (type === "buildRooms") {
    const roomCells = input.roomCells ?? [];
    return roomCells.length > 0 && canPayRoomCost(player, roomCells.length);
  }
  if (type === "buildStables") return Boolean(input.stableCells?.length);
  if (type === "buildFences") {
    const fenceSegments = input.fenceSegments ?? [];
    return fenceSegments.length > 0 && (input.useCardActionAccess || fenceSegments.length <= player.resources.wood) && fenceSegments.length <= availableFenceSlots;
  }
  if (type === "sow") {
    const sow = input.sow?.[0];
    if (!sow || sow.cells.length <= 0) return false;
    return sow.crop === "grain" ? sow.cells.length <= player.resources.grain : sow.cells.length <= player.resources.vegetable;
  }
  if (type === "gainAnimal" || type === "gainMissingAnimal") {
    return input.animalPlacement ? handledAnimalInput(input.animalPlacement) === animalAmount : false;
  }
  if (type === "takeAccumulated") return hasAccumulatedAnimal(actionSpace) ? (input.animalPlacement ? handledAnimalInput(input.animalPlacement) === animalAmount : false) : true;
  if (type === "buyMajorImprovement") return Boolean(input.majorImprovementId);
  if (type === "farmingSupplies") return Boolean((input.farmingSupplies?.grainTrades ?? 0) > 0 || input.farmingSupplies?.fieldTrades?.length);
  if (type === "bakeBread") return isValidBakeInput(player, input.bake);
  if (type === "sideJob") return Boolean(input.stableCells?.length || isValidBakeInput(player, input.bake));
  return true;
}

function handledAnimalInput(input: AnimalPlacementInput): number {
  return input.placements.reduce((sum, placement) => sum + placement.count, 0) + (input.cooked ?? 0) + (input.discarded ?? 0);
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
  if (mode === "animal") return "点击房屋、独立马厩或封闭牧场安置动物；也可以主动烹饪或丢弃。";
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

function pickAnimalAmount(actionSpace: ActionSpaceState, choice?: ActionEffectChoice): number {
  if (choice?.effect.type === "gainAnimal") return choice.effect.amount;
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

function getAnimalTarget(player: PlayerState, row: number, col: number, animal: FarmAnimalType, pendingPlacements: AnimalPlacementInput["placements"] = []) {
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
    const existingCell = player.farm.animalHousing.cells.find((item) => item.row === row && item.col === col);
    const pendingInPasture = pendingPlacements
      .filter((item) => item.type === "pasture" && item.pastureId === pasture.id)
      .reduce((sum, item) => sum + item.count, 0);
    const pendingInCell = pendingPlacements
      .filter((item) => item.type === "pasture" && item.pastureId === pasture.id && item.row === row && item.col === col)
      .reduce((sum, item) => sum + item.count, 0);
    const cellCapacity = cell.stable ? 4 : 2;
    const available = Math.min(pasture.capacity - pasture.animalCount - pendingInPasture, cellCapacity - (existingCell?.count ?? 0) - pendingInCell);
    if (available <= 0) return null;
    return {
      label: `牧场 ${pasture.capacity - pasture.animalCount}`,
      capacity: available,
      placement: { type: "pasture" as const, pastureId: pasture.id, row, col, count: 1 },
    };
  }
  return null;
}

function placementKey(placement: AnimalPlacementInput["placements"][number]): string {
  if (placement.type === "house") return "house";
  if (placement.type === "stable") return `stable:${placement.row}:${placement.col}`;
  return `pasture:${placement.pastureId}:${placement.row}:${placement.col}`;
}

function animalPlacementLabel(target: NonNullable<ReturnType<typeof getAnimalTarget>>, selectedCount: number): string {
  return selectedCount > 0 ? `${target.label} / 已选${selectedCount}` : target.label;
}

function placementCount(placements: AnimalPlacementInput["placements"], placement: AnimalPlacementInput["placements"][number]): number {
  const key = placementKey(placement);
  return placements.filter((item) => placementKey(item) === key).reduce((sum, item) => sum + item.count, 0);
}

function sumPlacements(placements: AnimalPlacementInput["placements"]): number {
  return placements.reduce((sum, placement) => sum + placement.count, 0);
}

function canBakeBread(player: PlayerState): boolean {
  return player.majorImprovements.some((id) => id.startsWith("fireplace") || id.startsWith("cooking-hearth") || id === "clay-oven" || id === "stone-oven");
}

function getBakeOptions(player: PlayerState): Array<{ id: string; name: string; grainLimit: number | null; foodPerGrain: number }> {
  return player.majorImprovements.flatMap((cardId) => {
    const card = majorImprovements.find((candidate) => candidate.id === cardId);
    const effect = card?.effects.find((candidate) => candidate.type === "bakeBread");
    if (!card || !effect || effect.type !== "bakeBread") {
      return [];
    }
    return [{ id: card.id, name: card.name, grainLimit: effect.grainLimit, foodPerGrain: effect.foodPerGrain }];
  });
}

function bakeOptionLimit(option: { grainLimit: number | null }): number {
  return option.grainLimit ?? 1;
}

function bakeOptionHint(option: { grainLimit: number | null }): string {
  const limit = bakeOptionLimit(option);
  return limit === 1 ? "每次 1 个" : `本次可选 1-${limit} 个`;
}

function isValidBakeInput(player: PlayerState, bake?: ActionInput["bake"]): boolean {
  if (!bake || !bake.improvementId) return false;
  const option = getBakeOptions(player).find((candidate) => candidate.id === bake.improvementId);
  if (!option) return false;
  if (bake.grain <= 0 || bake.grain > player.resources.grain) return false;
  if (bake.grain > bakeOptionLimit(option)) return false;
  return true;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function firstAvailableMajorImprovementId(game: ReturnType<typeof useGameStore.getState>["game"], playerId?: string | null): string | undefined {
  if (!game || !playerId) return undefined;
  return game.majorImprovements.find((card) => !card.purchasedBy)?.id;
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

function renovationPlan(player?: PlayerState | null) {
  if (!player) return null;
  const from = player.farm.roomMaterial;
  const to = from === "wood" ? "clay" : from === "clay" ? "stone" : null;
  if (!to) {
    return {
      ready: false,
      reason: "石屋不能继续翻修。",
      fromLabel: "石屋",
      toLabel: "",
      roomCount: 0,
      resourceLabel: "",
      resourceAmount: 0,
      reedAmount: 0,
      availableResource: 0,
      availableReed: player.resources.reed,
    };
  }
  const resource = to === "clay" ? "clay" : "stone";
  const roomCount = player.farm.cells.filter((cell) => cell.room).length;
  const resourceAmount = roomCount;
  const reedAmount = 1;
  const availableResource = player.resources[resource];
  const availableReed = player.resources.reed;
  const ready = availableResource >= resourceAmount && availableReed >= reedAmount;
  return {
    ready,
    reason: ready ? "" : `翻修资源不足：需要 ${resourceLabel(resource)} ${resourceAmount}、芦苇 ${reedAmount}。`,
    fromLabel: roomMaterialName(from),
    toLabel: roomMaterialName(to),
    roomCount,
    resourceLabel: resourceLabel(resource),
    resourceAmount,
    reedAmount,
    availableResource,
    availableReed,
  };
}

function canRenovate(player: PlayerState): boolean {
  return Boolean(renovationPlan(player)?.ready);
}

function FenceStickPickerLayer({
  player,
  selectedSegments,
  onToggle,
}: {
  player: PlayerState;
  selectedSegments: FenceSegment[];
  onToggle: (segment: FenceSegment) => void;
}) {
  return (
    <div className="farm-picker__fence-layer">
      {allFenceSegments(player.farm.rows, player.farm.cols).map((segment) => {
        const key = segmentKey(segment);
        const placed = hasFence(player, segment);
        const selected = selectedSegments.some((item) => segmentKey(item) === key);
        const buildable = isFenceSegmentBuildable(player, segment);
        return (
          <button
            key={key}
            type="button"
            className={`farm-picker__stick farm-picker__stick--${segment.orientation} ${placed ? "placed" : ""} ${selected ? "selected" : ""} ${!buildable ? "invalid" : ""}`}
            style={segmentStyle(segment, player.farm.rows, player.farm.cols)}
            disabled={placed || !buildable}
            title={fenceSegmentTitle(player, segment)}
            onClick={(event) => {
              event.stopPropagation();
              if (placed || !buildable) return;
              onToggle(segment);
            }}
          />
        );
      })}
    </div>
  );
}

function translateRoomMaterial(material: PlayerState["farm"]["roomMaterial"]): string {
  if (material === "clay") return "黏土";
  if (material === "stone") return "石头";
  return "木材";
}

function roomMaterialName(material: PlayerState["farm"]["roomMaterial"]): string {
  if (material === "clay") return "瓦房";
  if (material === "stone") return "石屋";
  return "木屋";
}

function allFenceSegments(rows: number, cols: number): FenceSegment[] {
  const segments: FenceSegment[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      segments.push({ orientation: "vertical", row, col });
    }
  }
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      segments.push({ orientation: "horizontal", row, col });
    }
  }
  return segments;
}

function segmentKey(segment: FenceSegment): string {
  return `${segment.orientation}:${segment.row}:${segment.col}`;
}

function hasFence(player: PlayerState, segment: FenceSegment): boolean {
  return (player.farm.fenceSegments ?? []).some((candidate) => segmentKey(candidate) === segmentKey(segment));
}

function isFenceSegmentBuildable(player: PlayerState, segment: FenceSegment): boolean {
  const adjacent = getSegmentAdjacentCells(player, segment);
  return adjacent.length > 0 && !adjacent.every((cell) => cell.room || cell.field);
}

function fenceSegmentTitle(player: PlayerState, segment: FenceSegment): string {
  if (hasFence(player, segment)) return "已建围栏";
  if (!isFenceSegmentBuildable(player, segment)) return "房屋或田地之间、以及它们贴农场边界的位置不能建围栏";
  return "放置围栏";
}

function segmentStyle(segment: FenceSegment, rows: number, cols: number) {
  if (segment.orientation === "vertical") {
    return {
      left: boundaryOffset(segment.col, cols),
      top: `calc(${segment.row} * (var(--farm-picker-cell) + var(--farm-picker-gap)) + (var(--farm-picker-cell) / 2))`,
    };
  }
  return {
    left: `calc(${segment.col} * (var(--farm-picker-cell) + var(--farm-picker-gap)) + (var(--farm-picker-cell) / 2))`,
    top: boundaryOffset(segment.row, rows),
  };
}

function boundaryOffset(index: number, count: number): string {
  if (index <= 0) return "0px";
  if (index >= count) return `calc(${count} * var(--farm-picker-cell) + ${count - 1} * var(--farm-picker-gap))`;
  return `calc(${index} * var(--farm-picker-cell) + ${index - 0.5} * var(--farm-picker-gap))`;
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
