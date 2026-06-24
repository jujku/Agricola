import type { ActionEffect, AnimalKey, CropKey, ResourceKey } from "../config/baseActions";
import { getMinorImprovement } from "../config/minorImprovements";
import { getOccupation } from "../config/occupations";
import { findCardIdWithActionAccess, hasCardActionAccess } from "../shared/cardEffectUtils";
import type { ActionInput } from "../shared/types";
import type { GameState } from "../state/GameState";
import type { PlayerState } from "../state/PlayerState";
import { AnimalManager } from "./AnimalManager";
import { CardManager } from "./CardManager";
import { FarmManager } from "./FarmManager";
import { RoundManager } from "./RoundManager";

export class ActionResolver {
  private animalManager = new AnimalManager();
  private cardManager = new CardManager();
  private farmManager = new FarmManager();
  private roundManager = new RoundManager();

  placeWorker(state: GameState, playerId: string, workerId: string, actionSpaceId: string, input: ActionInput = {}): GameState {
    if (state.phase !== "WORK_PHASE") {
      throw new Error("当前不是工人放置阶段。");
    }
    if (state.currentPlayer !== playerId) {
      throw new Error("还没有轮到该玩家行动。");
    }

    const actionSpace = state.actionSpaces.find((space) => space.id === actionSpaceId);
    if (!actionSpace) {
      throw new Error("行动格不存在。");
    }
    const accumulatedBeforeAction = { ...actionSpace.accumulated };
    const player = this.getPlayer(state, playerId);
    if (actionSpace.visibility === "private" && actionSpace.ownerId && actionSpace.ownerId !== playerId) {
      throw new Error("这是其他玩家的私人行动格。");
    }
    const actionGroups = this.actionGroupsForAction(actionSpaceId, input.selectedEffectTypes ?? []);
    const canUseOccupied = actionSpace.occupiedBy && this.canUseOccupiedAction(player, actionGroups);
    const usesFreeFenceAction = this.usesFreeFenceAction(player, actionGroups, input);
    const usesPendingActionAccess = Boolean(input.usePendingActionAccess);
    if (state.pendingCardChoice) {
      throw new Error("请先处理卡牌触发的选择。");
    }
    if (state.pendingActionAccess && !usesPendingActionAccess && !usesFreeFenceAction) {
      throw new Error("请先使用或放弃卡牌提供的连续行动。");
    }
    if (usesPendingActionAccess) {
      this.assertPendingActionAccess(state, playerId, actionSpaceId);
    }
    if (actionSpace.occupiedBy && !canUseOccupied) {
      throw new Error("行动格已经被占用。");
    }

    const worker = player.workers.find((candidate) => candidate.id === workerId);
    if (usesFreeFenceAction && !hasCardActionAccess(player, "freeFenceAction")) {
      throw new Error("没有可用的卡牌行动权限。");
    }
    if (!usesFreeFenceAction && (!worker || worker.location !== "home" || worker.availableRound > state.round)) {
      throw new Error("工人不可用。");
    }

    let nextState: GameState = {
      ...state,
      workPhaseActionCount: (state.workPhaseActionCount ?? 0) + 1,
      lastActionOrdinalByPlayerId: {
        ...(state.lastActionOrdinalByPlayerId ?? {}),
        [playerId]: (state.workPhaseActionCount ?? 0) + 1,
      },
      actionSpaces: state.actionSpaces.map((space) => (space.id === actionSpaceId && !canUseOccupied ? { ...space, occupiedBy: playerId } : space)),
      players: state.players.map((candidate) =>
        candidate.id === playerId && !usesFreeFenceAction
          ? {
              ...candidate,
              workers: candidate.workers.map((candidateWorker) =>
                candidateWorker.id === workerId
                  ? {
                      ...candidateWorker,
                      location: "action_space" as const,
                      actionSpaceId,
                    }
                  : candidateWorker,
              ),
            }
          : candidate,
      ),
      pendingActionAccess: usesPendingActionAccess ? null : state.pendingActionAccess,
      lastError: null,
    };

    nextState = this.payActionSpaceOwner(nextState, playerId, actionSpace);

    if (usesFreeFenceAction) {
      nextState = this.markActionAccessUsed(nextState, playerId, "freeFenceAction");
    }

    for (const effect of actionSpace.effects) {
      nextState = this.applyEffect(nextState, playerId, actionSpaceId, effect, input);
    }

    nextState = this.applyActionAccessFollowUp(nextState, playerId, actionGroups, actionSpace.effects, input);
    const actorAfterActionEffects = this.getPlayer(nextState, playerId);
    nextState = this.cardManager.applyAfterAction(nextState, playerId, actionSpaceId, input, {
      actionBakeBreadUsed: Boolean(input.bake && this.actionWillApplyEffect(actionSpace.effects, input, "bakeBread")),
      accumulatedTaken: this.actionWillApplyEffect(actionSpace.effects, input, "takeAccumulated") ? accumulatedBeforeAction : {},
      actorBefore: player,
      actorAfter: actorAfterActionEffects,
    });

    const afterPlayer = this.getPlayer(nextState, playerId);
    const withLog = {
      ...nextState,
      actionLog: [...nextState.actionLog, this.describeActionLog(state, nextState, player, afterPlayer, actionSpace.name)],
    };
    const pendingAccess = this.createPendingActionAccess(afterPlayer, actionGroups, state.round);
    return pendingAccess
      ? {
          ...withLog,
          currentPlayer: playerId,
          currentPlayerIndex: Math.max(0, withLog.players.findIndex((candidate) => candidate.id === playerId)),
          pendingActionAccess: pendingAccess,
        }
      : this.roundManager.advanceCurrentPlayer(withLog);
  }

  private applyEffect(state: GameState, playerId: string, actionSpaceId: string, effect: ActionEffect, input: ActionInput): GameState {
    if (effect.type === "chooseAny") {
      return this.resolveNestedEffects(state, playerId, actionSpaceId, effect.effects, input, false);
    }
    if (effect.type === "chooseOne") {
      return this.resolveNestedEffects(state, playerId, actionSpaceId, effect.effects, input, true);
    }
    if (this.hasSelection(input) && !this.isSelectedEffect(effect, input)) {
      return state;
    }

    switch (effect.type) {
      case "takeAccumulated":
        return this.takeAccumulated(state, playerId, actionSpaceId, input);
      case "gainResource":
        return this.updatePlayer(state, playerId, (player) => this.gainResource(player, effect.resource, effect.amount));
      case "gainAnimal":
        if (input.animalChoice && input.animalChoice !== effect.animal) {
          return state;
        }
        return this.updatePlayer(state, playerId, (player) => this.applyAnimalGain(player, effect, input));
      case "plowField":
        return input.fieldCell ? this.updatePlayer(state, playerId, (player) => this.farmManager.plowField(player, input.fieldCell!)) : state;
      case "buildRooms":
        return this.updatePlayer(state, playerId, (player) => this.farmManager.buildRooms(player, input.roomCells ?? []));
      case "buildStables":
        return this.updatePlayer(state, playerId, (player) => this.farmManager.buildStables(player, input.stableCells ?? [], effect.max, effect.woodCost));
      case "buildFences":
        return this.updatePlayer(state, playerId, (player) =>
          input.fenceSegments
            ? this.farmManager.buildFencesBySegments(player, input.fenceSegments, { free: Boolean(input.useCardActionAccess) })
            : input.fenceEdges
              ? this.farmManager.buildFencesByEdges(player, input.fenceEdges, { free: Boolean(input.useCardActionAccess) })
              : this.farmManager.buildFences(player, input.pastureCells ?? [], { free: Boolean(input.useCardActionAccess) }),
        );
      case "sow":
        return this.applySow(state, playerId, input);
      case "bakeBread":
        return input.bake
          ? this.updatePlayer(state, playerId, (player) => this.cardManager.bakeBread(player, input.bake!.improvementId, input.bake!.grain))
          : state;
      case "buyMajorImprovement":
        if (effect.minimumRound && state.round < effect.minimumRound) {
          throw new Error("当前回合不满足购买大设施前置条件。");
        }
        return input.majorImprovementId ? this.cardManager.buyMajorImprovement(state, playerId, input.majorImprovementId, input) : state;
      case "playOccupation":
        return this.cardManager.playOccupation(state, playerId, input.occupationCardId);
      case "playMinorImprovement":
        return this.cardManager.playMinorImprovement(state, playerId, input.minorImprovementCardId);
      case "playOccupationPlaceholder":
      case "playMinorImprovementPlaceholder":
        return { ...state, lastError: "请通过行动格选择要打出的职业卡或小设施。" };
      case "takeStartingPlayer":
        return { ...state, startingPlayer: playerId };
      case "renovate":
        return this.applyRenovation(state, playerId, effect.allowMajorImprovement, input);
      case "familyGrowth":
        return this.updatePlayer(state, playerId, (player) => this.growFamily(player, state.round, effect.requiresRoom, effect.minimumRound));
      case "gainMissingAnimal":
        return this.updatePlayer(state, playerId, (player) => this.gainMissingAnimal(player, input));
      case "buildingSupplies":
        return this.updatePlayer(state, playerId, (player) => this.applyBuildingSupplies(player, input, effect.resources));
      case "farmingSupplies":
        return this.updatePlayer(state, playerId, (player) => this.applyFarmingSupplies(player, input));
      case "sideJob":
        return this.applySideJob(state, playerId, input);
    }
  }

  private resolveNestedEffects(state: GameState, playerId: string, actionSpaceId: string, effects: ActionEffect[], input: ActionInput, chooseOne: boolean): GameState {
    const availableEffects = effects.filter((effect) => !this.isUnavailablePlaceholder(effect));
    const effectsToApply =
      this.hasSelection(input)
        ? effects.filter((effect) => this.isSelectedEffect(effect, input))
        : chooseOne
          ? availableEffects.slice(0, 1)
          : availableEffects;
    if (chooseOne && effectsToApply.length > 1) {
      throw new Error("这个行动格只能选择一个行动。");
    }
    this.assertRequiredPrecedingEffects(effectsToApply);
    return effectsToApply.reduce((currentState, effect) => this.applyEffect(currentState, playerId, actionSpaceId, effect, input), state);
  }

  private assertRequiredPrecedingEffects(effects: ActionEffect[]): void {
    const selectedTypes = new Set<string>(effects.map((effect) => effect.type));
    effects.forEach((effect) => {
      effect.requiresSelectedEffectTypes?.forEach((requiredType) => {
        if (!selectedTypes.has(requiredType)) {
          throw new Error(this.requiredEffectMessage(requiredType));
        }
      });
      if ((effect.type === "buyMajorImprovement" || effect.type === "playMinorImprovement" || effect.type === "playMinorImprovementPlaceholder") && selectedTypes.has("renovate") && !effect.requiresSelectedEffectTypes?.includes("renovate")) {
        throw new Error("必须通过对应的翻修后续行动执行。");
      }
    });
  }

  private hasSelection(input: ActionInput): boolean {
    return Boolean(input.selectedEffectIds?.length || input.selectedEffectTypes?.length);
  }

  private isSelectedEffect(effect: ActionEffect, input: ActionInput): boolean {
    const selectedIds = input.selectedEffectIds ?? [];
    if (selectedIds.length > 0) {
      if (effect.id && selectedIds.includes(effect.id)) return true;
      if ("effects" in effect && effect.effects?.some((child) => this.isSelectedEffect(child, input))) return true;
      return this.isSelectedEffectType(effect, input);
    }
    return this.isSelectedEffectType(effect, input);
  }

  private isSelectedEffectType(effect: ActionEffect, input: ActionInput): boolean {
    const selectedTypes = input.selectedEffectTypes ?? [];
    if (!selectedTypes.includes(effect.type)) {
      if ("effects" in effect && effect.effects?.some((child) => this.isSelectedEffect(child, input))) return true;
      return false;
    }
    if (effect.type === "gainAnimal" && input.animalChoice) {
      return effect.animal === input.animalChoice;
    }
    return true;
  }

  private isUnavailablePlaceholder(effect: ActionEffect): boolean {
    return effect.type === "playOccupationPlaceholder" || effect.type === "playMinorImprovementPlaceholder";
  }

  private actionWillApplyEffect(effects: ActionEffect[], input: ActionInput, type: ActionEffect["type"]): boolean {
    return effects.some((effect) => this.effectWillApply(effect, input, type));
  }

  private effectWillApply(effect: ActionEffect, input: ActionInput, type: ActionEffect["type"]): boolean {
    if (effect.type === "chooseAny" || effect.type === "chooseOne") {
      const availableEffects = effect.effects.filter((child) => !this.isUnavailablePlaceholder(child));
      const effectsToApply =
        this.hasSelection(input)
          ? effect.effects.filter((child) => this.isSelectedEffect(child, input))
          : effect.type === "chooseOne"
            ? availableEffects.slice(0, 1)
            : availableEffects;
      return effectsToApply.some((child) => this.effectWillApply(child, input, type));
    }
    if (this.hasSelection(input) && !this.isSelectedEffect(effect, input)) return false;
    return effect.type === type;
  }

  private requiredEffectMessage(requiredType: string): string {
    if (requiredType === "renovate") return "必须先翻修房屋后才能执行后续行动。";
    if (requiredType === "familyGrowth") return "必须先生孩子后才能打出小设施。";
    return "缺少前置行动。";
  }

  private takeAccumulated(state: GameState, playerId: string, actionSpaceId: string, input: ActionInput): GameState {
    const actionSpace = state.actionSpaces.find((space) => space.id === actionSpaceId);
    if (!actionSpace) {
      return state;
    }

    let nextState = state;
    const nextAccumulated = { ...actionSpace.accumulated };
    Object.entries(actionSpace.accumulated).forEach(([key, amount]) => {
      if (this.isResourceKey(key)) {
        nextState = this.updatePlayer(nextState, playerId, (player) => this.gainResource(player, key, amount));
        nextAccumulated[key] = 0;
      }
      if (this.isAnimalKey(key)) {
        if (!input.animalPlacement || input.animalPlacement.animal !== key) {
          throw new Error("必须选择动物安置、烹饪或丢弃方式。");
        }
        nextState = this.updatePlayer(nextState, playerId, (player) => this.animalManager.resolveAnimalGain(player, key, amount, input.animalPlacement));
        nextAccumulated[key] = 0;
      }
    });

    return {
      ...nextState,
      actionSpaces: nextState.actionSpaces.map((space) => (space.id === actionSpaceId ? { ...space, accumulated: nextAccumulated } : space)),
    };
  }

  private applySow(state: GameState, playerId: string, input: ActionInput): GameState {
    return (input.sow ?? []).reduce(
      (currentState, sowInput) => this.updatePlayer(currentState, playerId, (player) => this.farmManager.sow(player, sowInput.crop, sowInput.cells)),
      state,
    );
  }

  private applyRenovation(state: GameState, playerId: string, allowMajorImprovement: boolean, input: ActionInput): GameState {
    let nextState = this.updatePlayer(state, playerId, (player) => this.farmManager.renovate(player));
    if (allowMajorImprovement && input.majorImprovementId) {
      nextState = this.cardManager.buyMajorImprovement(nextState, playerId, input.majorImprovementId, input);
    }
    return nextState;
  }

  private applySideJob(state: GameState, playerId: string, input: ActionInput): GameState {
    let nextState = this.updatePlayer(state, playerId, (player) => this.farmManager.buildStables(player, input.stableCells ?? [], input.stableCells?.length ?? 0, 1));
    if (input.bake) {
      nextState = this.updatePlayer(nextState, playerId, (player) => this.cardManager.bakeBread(player, input.bake!.improvementId, input.bake!.grain));
    }
    return nextState;
  }

  private applyFarmingSupplies(player: PlayerState, input: ActionInput): PlayerState {
    let nextPlayer = player;
    const grainTrades = input.farmingSupplies?.grainTrades ?? 0;
    if (grainTrades > 0) {
      nextPlayer = this.farmManager.pay(nextPlayer, { food: grainTrades });
      nextPlayer = this.gainResource(nextPlayer, "grain", grainTrades);
    }
    (input.farmingSupplies?.fieldTrades ?? []).forEach((cell) => {
      nextPlayer = this.farmManager.pay(nextPlayer, { food: 1 });
      nextPlayer = this.farmManager.plowField(nextPlayer, cell);
    });
    return nextPlayer;
  }

  private applyAnimalGain(player: PlayerState, effect: Extract<ActionEffect, { type: "gainAnimal" }>, input: ActionInput): PlayerState {
    let nextPlayer = player;
    if ((effect.foodDelta ?? 0) < 0) {
      nextPlayer = this.farmManager.pay(nextPlayer, { food: Math.abs(effect.foodDelta ?? 0) });
    }
    if (!input.animalPlacement) {
      throw new Error("必须选择动物安置、烹饪或丢弃方式。");
    }
    nextPlayer = this.animalManager.resolveAnimalGain(nextPlayer, effect.animal, effect.amount, input.animalPlacement);
    if ((effect.foodDelta ?? 0) > 0) {
      nextPlayer = this.gainResource(nextPlayer, "food", effect.foodDelta ?? 0);
    }
    return nextPlayer;
  }

  private applyBuildingSupplies(player: PlayerState, input: ActionInput, fixedResources?: Partial<Record<ResourceKey, number>>): PlayerState {
    if (fixedResources) {
      return Object.entries(fixedResources).reduce((nextPlayer, [resource, amount]) => {
        if (!this.isResourceKey(resource) || !amount) return nextPlayer;
        return this.gainResource(nextPlayer, resource, amount);
      }, player);
    }
    let nextPlayer = this.gainResource(player, input.resourceChoices?.first ?? "reed", 1);
    nextPlayer = this.gainResource(nextPlayer, input.resourceChoices?.second ?? "wood", 1);
    return this.gainResource(nextPlayer, "food", 1);
  }

  private growFamily(player: PlayerState, round: number, requiresRoom: boolean, minimumRound?: number): PlayerState {
    if (minimumRound && round < minimumRound) {
      throw new Error("当前回合不满足生孩子前置条件。");
    }
    if (player.workers.length >= 5) {
      throw new Error("家庭成员最多5个。");
    }
    if (requiresRoom && this.farmManager.countEmptyRooms(player) < 1) {
      throw new Error("没有空房间。");
    }
    const paidImmediateNewborn = hasCardActionAccess(player, "immediateNewborn") && player.resources.food > 0;
    const nextPlayer = paidImmediateNewborn ? this.farmManager.pay(player, { food: 1 }) : player;
    const workerNumber = player.workers.length + 1;
    return {
      ...nextPlayer,
      workers: [
        ...nextPlayer.workers,
        {
          id: `${player.id}-worker-${workerNumber}`,
          location: "home",
          actionSpaceId: null,
          availableRound: paidImmediateNewborn ? round : round + 1,
        },
      ],
    };
  }

  private canUseOccupiedAction(player: PlayerState, actionGroups: string[]): boolean {
    if (actionGroups.includes("familyGrowth") && hasCardActionAccess(player, "occupiedFamilyGrowth")) {
      return true;
    }
    return false;
  }

  private usesFreeFenceAction(player: PlayerState, actionGroups: string[], input: ActionInput): boolean {
    return actionGroups.includes("fences") && Boolean(input.useCardActionAccess) && hasCardActionAccess(player, "freeFenceAction");
  }

  private createPendingActionAccess(player: PlayerState, actionGroups: string[], round: number): GameState["pendingActionAccess"] {
    if (!player.workers.some((worker) => worker.location === "home" && worker.availableRound <= round)) {
      return null;
    }
    const sourceCardId = actionGroups.includes("familyGrowth") ? findCardIdWithActionAccess(player, "immediateNewborn") : null;
    if (sourceCardId) {
      return { playerId: player.id, access: "keepTurnAfterAnyAction", sourceCardId, createdRound: round, used: false };
    }
    const keepAnySource = findCardIdWithActionAccess(player, "keepTurnAfterAnyAction");
    if (keepAnySource) {
      return { playerId: player.id, access: "keepTurnAfterAnyAction", sourceCardId: keepAnySource, createdRound: round, used: false };
    }
    const keepAnimalSource = actionGroups.includes("animalMarket") ? findCardIdWithActionAccess(player, "keepTurnAfterAnimalMarket") : null;
    if (keepAnimalSource) {
      return { playerId: player.id, access: "keepTurnAfterAnimalMarket", sourceCardId: keepAnimalSource, createdRound: round, used: false };
    }
    return null;
  }

  private assertPendingActionAccess(state: GameState, playerId: string, actionSpaceId: string): void {
    const pending = state.pendingActionAccess;
    if (!pending || pending.used || pending.playerId !== playerId || pending.createdRound !== state.round) {
      throw new Error("没有可用的连续行动权限。");
    }
    if (pending.access === "keepTurnAfterAnimalMarket" && !this.isAdjacentToPreviousAction(state, playerId, actionSpaceId)) {
      throw new Error("这次连续行动必须放到上一行动格左侧相邻行动格。");
    }
  }

  private isAdjacentToPreviousAction(state: GameState, playerId: string, actionSpaceId: string): boolean {
    const previousActionId = state.players.find((player) => player.id === playerId)?.workers.find((worker) => worker.location === "action_space")?.actionSpaceId;
    if (!previousActionId) return false;
    const previousIndex = state.actionSpaces.findIndex((space) => space.id === previousActionId);
    const nextIndex = state.actionSpaces.findIndex((space) => space.id === actionSpaceId);
    return previousIndex > 0 && nextIndex === previousIndex - 1;
  }

  private payActionSpaceOwner(state: GameState, actorId: string, actionSpace: GameState["actionSpaces"][number]): GameState {
    if (!actionSpace.ownerId || actionSpace.ownerId === actorId || !actionSpace.ownerPayment || Object.keys(actionSpace.ownerPayment).length === 0) {
      return state;
    }
    const actor = this.getPlayer(state, actorId);
    const owner = this.getPlayer(state, actionSpace.ownerId);
    const payment = Object.entries(actionSpace.ownerPayment).reduce<Partial<Record<ResourceKey, number>>>((cost, [resource, amount]) => {
      if (this.isResourceKey(resource) && amount > 0) cost[resource] = amount;
      return cost;
    }, {});
    this.farmManager.assertCanPay(actor, payment);
    const paidActor = this.farmManager.pay(actor, payment);
    const paidResources = payment;
    return {
      ...state,
      players: state.players.map((player) => {
        if (player.id === actorId) return paidActor;
        if (player.id === owner.id) {
          return {
            ...player,
            resources: Object.entries(paidResources).reduce(
              (resources, [resource, amount]) => this.isResourceKey(resource) ? { ...resources, [resource]: resources[resource] + (amount ?? 0) } : resources,
              player.resources,
            ),
          };
        }
        return player;
      }),
    };
  }

  private applyActionAccessFollowUp(state: GameState, playerId: string, actionGroups: string[], effects: ActionEffect[], input: ActionInput): GameState {
    if (!actionGroups.includes("animalMarket")) return state;
    const player = this.getPlayer(state, playerId);
    if (!hasCardActionAccess(player, "doubleAnimalMarket")) return state;
    const animalEffect = this.selectedAnimalEffect(effects, input);
    if (!animalEffect || player.resources.food <= 0) return state;
    try {
      return this.updatePlayer(state, playerId, (currentPlayer) => {
        let nextPlayer = this.farmManager.pay(currentPlayer, { food: 1 });
        if ((animalEffect.foodDelta ?? 0) < 0) {
          nextPlayer = this.farmManager.pay(nextPlayer, { food: Math.abs(animalEffect.foodDelta ?? 0) });
        }
        const before = nextPlayer.animals[animalEffect.animal];
        nextPlayer = this.animalManager.resolveAnimalGain(nextPlayer, animalEffect.animal, animalEffect.amount);
        if (nextPlayer.animals[animalEffect.animal] === before) {
          return currentPlayer;
        }
        if ((animalEffect.foodDelta ?? 0) > 0) {
          nextPlayer = this.gainResource(nextPlayer, "food", animalEffect.foodDelta ?? 0);
        }
        return nextPlayer;
      });
    } catch {
      return state;
    }
  }

  private selectedAnimalEffect(effects: ActionEffect[], input: ActionInput): Extract<ActionEffect, { type: "gainAnimal" }> | null {
    const choices = effects.flatMap((effect) => this.flattenActionEffects(effect));
    const selectedIds = new Set(input.selectedEffectIds ?? []);
    const selectedTypes = new Set(input.selectedEffectTypes ?? []);
    const animalChoices = choices.filter((effect): effect is Extract<ActionEffect, { type: "gainAnimal" }> => effect.type === "gainAnimal");
    if (input.animalChoice) {
      return animalChoices.find((effect) => effect.animal === input.animalChoice) ?? null;
    }
    if (selectedIds.size > 0) {
      return animalChoices.find((effect) => effect.id && selectedIds.has(effect.id)) ?? null;
    }
    if (selectedTypes.has("gainAnimal")) {
      return animalChoices[0] ?? null;
    }
    return animalChoices.length === 1 ? animalChoices[0] : null;
  }

  private flattenActionEffects(effect: ActionEffect): ActionEffect[] {
    return "effects" in effect && effect.effects ? effect.effects.flatMap((child) => this.flattenActionEffects(child)) : [effect];
  }

  private markActionAccessUsed(state: GameState, playerId: string, access: "freeFenceAction"): GameState {
    const cardId = findCardIdWithActionAccess(this.getPlayer(state, playerId), access);
    if (!cardId) return state;
    return this.updatePlayer(state, playerId, (player) => ({
      ...player,
      cardStates: {
        ...player.cardStates,
        [cardId]: {
          ...(player.cardStates[cardId] ?? {
            cardId,
            playedRound: state.round,
            markers: {},
            storedAnimals: {},
            storedGoods: {},
            bonusPoints: 0,
          }),
          markers: {
            ...(player.cardStates[cardId]?.markers ?? {}),
            [`used:${access}:${state.round}`]: 1,
          },
        },
      },
    }));
  }

  private actionGroupsForAction(actionSpaceId: string, selectedEffectTypes: string[]): string[] {
    const groups = new Set<string>();
    const add = (...items: string[]) => items.forEach((item) => groups.add(item));
    if (["sheep-market", "boar-market", "cattle-market", "five-animal-market", "three-four-flex", "two-player-flex", "six-corral"].includes(actionSpaceId)) add("animalMarket");
    if (["family-growth-room", "family-growth-any", "five-lessons-family", "two-player-flex", "three-four-flex"].includes(actionSpaceId) || selectedEffectTypes.includes("familyGrowth")) add("familyGrowth");
    if (["fencing", "farm-redevelopment"].includes(actionSpaceId) || selectedEffectTypes.includes("buildFences")) add("fences", "building");
    if (["farm-expansion", "house-redevelopment", "five-build-room-traveling"].includes(actionSpaceId) || selectedEffectTypes.some((type) => ["buildRooms", "buildStables"].includes(type))) add("building");
    return [...groups];
  }

  private gainMissingAnimal(player: PlayerState, input: ActionInput): PlayerState {
    const animalChoice = input.animalChoice;
    const chosenAnimal = animalChoice ?? (["sheep", "boar", "cattle"] as AnimalKey[]).find((animal) => player.animals[animal] === 0);
    if (!chosenAnimal) {
      return player;
    }
    if (player.animals[chosenAnimal] > 0) {
      throw new Error("只能增加一只没有的动物。");
    }
    if (!input.animalPlacement) {
      throw new Error("必须选择动物安置、烹饪或丢弃方式。");
    }
    return this.animalManager.resolveAnimalGain(player, chosenAnimal, 1, input.animalPlacement);
  }

  private gainResource(player: PlayerState, resource: ResourceKey, amount: number): PlayerState {
    return {
      ...player,
      resources: {
        ...player.resources,
        [resource]: player.resources[resource] + amount,
      },
    };
  }

  private describeActionLog(beforeState: GameState, afterState: GameState, beforePlayer: PlayerState, afterPlayer: PlayerState, actionName: string): string {
    const gains = this.describeResourceChanges(beforePlayer, afterPlayer, true);
    const costs = this.describeResourceChanges(beforePlayer, afterPlayer, false);
    const animalChanges = this.describeAnimalChanges(beforePlayer, afterPlayer);
    const farmChanges = this.describeFarmChanges(beforePlayer, afterPlayer);
    const markers = beforeState.startingPlayer !== afterState.startingPlayer && afterState.startingPlayer === afterPlayer.id ? ["成为起始玩家"] : [];
    const parts = [...farmChanges, ...animalChanges, ...gains, ...costs, ...markers];
    const cardChanges = this.describeCardChanges(beforePlayer, afterPlayer);
    const allParts = [...parts, ...cardChanges];
    return allParts.length > 0 ? `${beforePlayer.name} 使用 ${actionName}：${allParts.join("，")}。` : `${beforePlayer.name} 使用 ${actionName}。`;
  }

  private describeCardChanges(beforePlayer: PlayerState, afterPlayer: PlayerState): string[] {
    const occupations = afterPlayer.occupations.filter((cardId) => !beforePlayer.occupations.includes(cardId));
    const minorImprovements = afterPlayer.minorImprovements.filter((cardId) => !beforePlayer.minorImprovements.includes(cardId));
    const passedMinorImprovements = beforePlayer.minorImprovementHand.filter((cardId) => !afterPlayer.minorImprovementHand.includes(cardId) && !afterPlayer.minorImprovements.includes(cardId));
    return [
      ...occupations.map((cardId) => `打出职业 ${this.occupationName(cardId)}`),
      ...minorImprovements.map((cardId) => `打出小设施 ${this.minorImprovementName(cardId)}`),
      ...passedMinorImprovements.map((cardId) => `打出并传递小设施 ${this.minorImprovementName(cardId)}`),
    ];
  }

  private occupationName(cardId: string): string {
    return getOccupation(cardId)?.name ?? cardId;
  }

  private minorImprovementName(cardId: string): string {
    return getMinorImprovement(cardId)?.name ?? cardId;
  }

  private describeResourceChanges(beforePlayer: PlayerState, afterPlayer: PlayerState, gain: boolean): string[] {
    return (["wood", "clay", "reed", "stone", "grain", "vegetable", "food"] as ResourceKey[])
      .map((resource) => ({ resource, diff: afterPlayer.resources[resource] - beforePlayer.resources[resource] }))
      .filter((item) => (gain ? item.diff > 0 : item.diff < 0))
      .map((item) => `${gain ? "获得" : "消耗"}${this.resourceLabel(item.resource)} ${Math.abs(item.diff)}`);
  }

  private describeAnimalChanges(beforePlayer: PlayerState, afterPlayer: PlayerState): string[] {
    return (["sheep", "boar", "cattle"] as AnimalKey[])
      .map((animal) => ({ animal, diff: afterPlayer.animals[animal] - beforePlayer.animals[animal] }))
      .filter((item) => item.diff !== 0)
      .map((item) => `${item.diff > 0 ? "获得" : "减少"}${this.animalLabel(item.animal)} ${Math.abs(item.diff)}`);
  }

  private describeFarmChanges(beforePlayer: PlayerState, afterPlayer: PlayerState): string[] {
    const beforeRooms = beforePlayer.farm.cells.filter((cell) => cell.room).length;
    const afterRooms = afterPlayer.farm.cells.filter((cell) => cell.room).length;
    const beforeFields = beforePlayer.farm.cells.filter((cell) => cell.field).length;
    const afterFields = afterPlayer.farm.cells.filter((cell) => cell.field).length;
    const beforeStables = beforePlayer.farm.cells.filter((cell) => cell.stable).length;
    const afterStables = afterPlayer.farm.cells.filter((cell) => cell.stable).length;
    const changes: string[] = [];

    if (beforePlayer.farm.roomMaterial !== afterPlayer.farm.roomMaterial) {
      changes.push(`翻修为${this.roomMaterialLabel(afterPlayer.farm.roomMaterial)}房屋`);
    }
    if (afterRooms > beforeRooms) {
      changes.push(`建造房间 ${afterRooms - beforeRooms}`);
    }
    if (afterFields > beforeFields) {
      changes.push(`翻耕田地 ${afterFields - beforeFields}`);
    }
    if (afterStables > beforeStables) {
      changes.push(`建造马厩 ${afterStables - beforeStables}`);
    }
    if (afterPlayer.farm.fencesUsed > beforePlayer.farm.fencesUsed) {
      changes.push(`建造围栏 ${afterPlayer.farm.fencesUsed - beforePlayer.farm.fencesUsed}`);
    }

    const cropChanges = this.describeFieldCropChanges(beforePlayer, afterPlayer);
    return [...changes, ...cropChanges];
  }

  private describeFieldCropChanges(beforePlayer: PlayerState, afterPlayer: PlayerState): string[] {
    const beforeCrops = this.countFieldCrops(beforePlayer);
    const afterCrops = this.countFieldCrops(afterPlayer);
    return (["grain", "vegetable"] as CropKey[])
      .map((crop) => ({ crop, diff: afterCrops[crop] - beforeCrops[crop] }))
      .filter((item) => item.diff > 0)
      .map((item) => `播种${this.resourceLabel(item.crop)} ${item.diff}`);
  }

  private countFieldCrops(player: PlayerState): Record<CropKey, number> {
    return player.farm.cells.reduce(
      (summary, cell) => {
        if (cell.field?.crop) {
          summary[cell.field.crop] += cell.field.count;
        }
        return summary;
      },
      { grain: 0, vegetable: 0 },
    );
  }

  private resourceLabel(resource: ResourceKey): string {
    const labels: Record<ResourceKey, string> = {
      wood: "木材",
      clay: "黏土",
      reed: "芦苇",
      stone: "石头",
      grain: "谷物",
      vegetable: "蔬菜",
      food: "食物",
    };
    return labels[resource];
  }

  private animalLabel(animal: AnimalKey): string {
    const labels: Record<AnimalKey, string> = {
      sheep: "羊",
      boar: "野猪",
      cattle: "牛",
    };
    return labels[animal];
  }

  private roomMaterialLabel(material: PlayerState["farm"]["roomMaterial"]): string {
    const labels: Record<PlayerState["farm"]["roomMaterial"], string> = {
      wood: "木",
      clay: "瓦",
      stone: "石头",
    };
    return labels[material];
  }

  private getPlayer(state: GameState, playerId: string): PlayerState {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error("玩家不存在。");
    }
    return player;
  }

  private updatePlayer(state: GameState, playerId: string, updater: (player: PlayerState) => PlayerState): GameState {
    return {
      ...state,
      players: state.players.map((player) => (player.id === playerId ? updater(player) : player)),
    };
  }

  private isResourceKey(key: string): key is ResourceKey {
    return ["wood", "clay", "reed", "stone", "grain", "vegetable", "food"].includes(key);
  }

  private isAnimalKey(key: string): key is AnimalKey {
    return ["sheep", "boar", "cattle"].includes(key);
  }
}
