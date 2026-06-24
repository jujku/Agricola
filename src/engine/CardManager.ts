import { majorImprovements, type MajorImprovementDefinition } from "../config/majorImprovements";
import {
  getMinorImprovement,
  getMinorImprovementResourceCost,
  minorImprovements,
  type ActionGroup,
  type CardConditionCount,
  type CardCondition,
  type CardEffect,
  type CardRequirement,
  type CardSchedule,
  type CardTrigger,
  type CostModifierScope,
  type MinorImprovementDefinition,
} from "../config/minorImprovements";
import { getOccupation, occupations, type OccupationDefinition } from "../config/occupations";
import type { AnimalKey, ResourceKey } from "../config/baseActions";
import type { ActionInput, HarvestConversionInput } from "../shared/types";
import type { GameState, HarvestCropSummary } from "../state/GameState";
import type { AnimalState, PendingGood, PlayedCardRuntimeState, PlayerState, ResourceState } from "../state/PlayerState";
import { calculateCardBonusPoints, countScoringCropFields } from "../shared/cardEffectUtils";
import { AnimalManager } from "./AnimalManager";
import { FarmManager } from "./FarmManager";

type CardEffectContext = {
  actorId: string;
  actionSpaceId: string | null;
  selectedEffectTypes: string[];
  input?: ActionInput;
  bake?: ActionInput["bake"];
  bakeBreadUsed?: boolean;
  accumulatedTaken?: Partial<Record<ResourceKey | AnimalKey, number>>;
  actorBefore?: PlayerState;
  actorAfter?: PlayerState;
  harvestedByPlayerId?: Record<string, HarvestCropSummary>;
};

export class CardManager {
  private animalManager = new AnimalManager();
  private farmManager = new FarmManager();

  registerCardEffects(state: GameState): GameState {
    return state;
  }

  createMinorImprovementDeck(): string[] {
    return this.shuffle(minorImprovements.map((card) => card.id));
  }

  createOccupationDeck(playerCount: number): string[] {
    return this.shuffle(occupations.filter((card) => playerCount >= card.minPlayers).map((card) => card.id));
  }

  dealInitialHands(players: PlayerState[], playerCount: number): { players: PlayerState[]; minorImprovementDeck: string[]; occupationDeck: string[] } {
    let minorImprovementDeck = this.createMinorImprovementDeck();
    let occupationDeck = this.createOccupationDeck(playerCount);
    const dealtPlayers = players.map((player) => {
      const minorImprovementHand = minorImprovementDeck.slice(0, 7);
      const occupationHand = occupationDeck.slice(0, 7);
      minorImprovementDeck = minorImprovementDeck.slice(7);
      occupationDeck = occupationDeck.slice(7);
      return {
        ...player,
        minorImprovementHand,
        occupationHand,
      };
    });

    return {
      players: dealtPlayers,
      minorImprovementDeck,
      occupationDeck,
    };
  }

  dealDraftPacks(players: PlayerState[], playerCount: number): { cardDraft: NonNullable<GameState["cardDraft"]>; minorImprovementDeck: string[]; occupationDeck: string[] } {
    let minorImprovementDeck = this.createMinorImprovementDeck();
    let occupationDeck = this.createOccupationDeck(playerCount);
    const packs = players.map((player) => {
      const minorImprovementIds = minorImprovementDeck.slice(0, 7);
      const occupationIds = occupationDeck.slice(0, 7);
      minorImprovementDeck = minorImprovementDeck.slice(7);
      occupationDeck = occupationDeck.slice(7);
      return {
        playerId: player.id,
        minorImprovementIds,
        occupationIds,
      };
    });

    return {
      cardDraft: {
        round: 1,
        picksPerPlayer: 7,
        direction: "left",
        packs,
        pendingSelections: {},
      },
      minorImprovementDeck,
      occupationDeck,
    };
  }

  playOccupation(state: GameState, playerId: string, cardId?: string): GameState {
    if (!cardId) {
      throw new Error("请选择要打出的职业卡。");
    }
    const card = getOccupation(cardId);
    if (!card) {
      throw new Error("职业卡不存在。");
    }
    if (state.players.length < card.minPlayers) {
      throw new Error("当前玩家数不满足这张职业卡的加入条件。");
    }

    const playedState = this.updatePlayerOnly(state, playerId, (player) => this.playOccupationForPlayer(player, card, state.round));
    return this.applyCardEffects(playedState, playerId, card.id, card.effects, "onPlay", {
      actorId: playerId,
      actionSpaceId: null,
      selectedEffectTypes: [],
    });
  }

  playMinorImprovement(state: GameState, playerId: string, cardId?: string): GameState {
    if (!cardId) {
      throw new Error("请选择要打出的小设施。");
    }
    const card = getMinorImprovement(cardId);
    if (!card) {
      throw new Error("小设施不存在。");
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error("玩家不存在。");
    }
    this.assertMinorRequirements(state, player, card, state.round);

    const paidPlayer = this.payMinorImprovementCost(player, card);
    const withoutCard = {
      ...paidPlayer,
      minorImprovementHand: paidPlayer.minorImprovementHand.filter((id) => id !== card.id),
    };
    const currentPlayer = card.passesAfterPlay
      ? withoutCard
      : {
          ...withoutCard,
          minorImprovements: [...withoutCard.minorImprovements, card.id],
          cardStates: this.addPlayedCardState(withoutCard, card.id, state.round).cardStates,
        };
    const nextPlayerId = card.passesAfterPlay ? this.nextPlayerId(state, playerId) : null;
    const movedState: GameState = {
      ...state,
      players: state.players.map((candidate) => {
        if (candidate.id === playerId) return currentPlayer;
        if (nextPlayerId && candidate.id === nextPlayerId) {
          return {
            ...candidate,
            minorImprovementHand: [...candidate.minorImprovementHand, card.id],
          };
        }
        return candidate;
      }),
    };
    return this.applyCardEffects(movedState, playerId, card.id, card.effects, "onPlay", {
      actorId: playerId,
      actionSpaceId: null,
      selectedEffectTypes: [],
    });
  }

  buyMajorImprovement(state: GameState, playerId: string, cardId: string, input: ActionInput = {}): GameState {
    const card = majorImprovements.find((candidate) => candidate.id === cardId);
    if (!card) {
      throw new Error("大设施不存在。");
    }
    if (state.majorImprovements.find((candidate) => candidate.id === cardId)?.purchasedBy) {
      throw new Error("该大设施已被购买。");
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    const returnedCardId =
      input.upgradeFromId && card.upgradeFrom?.includes(input.upgradeFromId) && player?.majorImprovements.includes(input.upgradeFromId)
        ? input.upgradeFromId
        : undefined;

    return this.updatePlayer(state, playerId, (player) => {
      let nextPlayer = this.payForMajor(player, card, input.upgradeFromId);
      nextPlayer = {
        ...nextPlayer,
        majorImprovements: [...nextPlayer.majorImprovements, card.id],
      };
      if (card.effects.some((effect) => effect.type === "wellFood")) {
        nextPlayer = this.scheduleWellFood(state, nextPlayer, card);
      }
      if (input.bake) {
        nextPlayer = this.bakeBread(nextPlayer, input.bake.improvementId, input.bake.grain);
      }
      return nextPlayer;
    }, cardId, returnedCardId);
  }

  applyAfterAction(
    state: GameState,
    actorId: string,
    actionSpaceId: string,
    input: ActionInput = {},
    options: { actionBakeBreadUsed?: boolean; accumulatedTaken?: Partial<Record<ResourceKey | AnimalKey, number>>; actorBefore?: PlayerState; actorAfter?: PlayerState } = {},
  ): GameState {
    return state.players.reduce((nextState, player) => {
      const triggerSource = player.id === actorId && options.actorBefore ? options.actorBefore : player;
      const cardIds = [...triggerSource.occupations, ...triggerSource.minorImprovements];
      const selectedEffectTypes = input.selectedEffectTypes ?? [];
      const cardBakeBreadUsed = Boolean(input.bake) && player.id === actorId && this.hasMatchingCardBakeBread(state, player.id, actorId, actionSpaceId, selectedEffectTypes);
      return cardIds.reduce((currentState, cardId) => {
        const effects = this.cardEffects(cardId);
        return this.applyCardEffects(currentState, player.id, cardId, effects, "afterAction", {
          actorId,
          actionSpaceId,
          selectedEffectTypes,
          bake: input.bake,
          bakeBreadUsed: Boolean(options.actionBakeBreadUsed || cardBakeBreadUsed),
          accumulatedTaken: options.accumulatedTaken,
          actorBefore: options.actorBefore,
          actorAfter: options.actorAfter,
          input,
        });
      }, nextState);
    }, state);
  }

  applyRoundStart(state: GameState): GameState {
    const withPending = {
      ...state,
      players: state.players.map((player) => this.applyPendingGoods(player, state.round)),
    };
    return withPending.players.reduce((nextState, player) => {
      const cardIds = [...player.occupations, ...player.minorImprovements];
      return cardIds.reduce((currentState, cardId) => this.applyCardEffects(currentState, player.id, cardId, this.cardEffects(cardId), "roundStart", {
        actorId: player.id,
        actionSpaceId: null,
        selectedEffectTypes: [],
      }), nextState);
    }, withPending);
  }

  applyHarvestStart(state: GameState): GameState {
    return this.applyTriggerForAllPlayers(state, "harvestStart");
  }

  applyHarvestField(state: GameState, harvestedByPlayerId: Record<string, HarvestCropSummary>): GameState {
    return this.applyTriggerForAllPlayers(state, "harvestField", { harvestedByPlayerId });
  }

  applyReturnHome(state: GameState): GameState {
    return this.applyTriggerForAllPlayers(state, "returnHome");
  }

  submitPendingCardChoice(state: GameState, playerId: string, input: ActionInput = {}): GameState {
    const pending = state.pendingCardChoice;
    if (!pending) {
      throw new Error("没有需要处理的卡牌选择。");
    }
    if (pending.playerId !== playerId) {
      throw new Error("只能处理自己的卡牌选择。");
    }

    const nextState = this.updatePlayerOnly(state, playerId, (player) => {
      let nextPlayer = pending.cost ? this.farmManager.pay(player, pending.cost) : player;
      if (pending.removeWorkers && pending.removeWorkers > 0) {
        if (nextPlayer.workers.length <= 2 || nextPlayer.workers.length < pending.removeWorkers) {
          throw new Error("家庭成员不足，不能执行这张卡牌的代价。");
        }
        nextPlayer = {
          ...nextPlayer,
          workers: nextPlayer.workers.slice(0, nextPlayer.workers.length - pending.removeWorkers),
        };
      }

      if (pending.resources) {
        nextPlayer = this.gainResources(nextPlayer, pending.resources);
      }

      if (pending.type === "gainAnimals") {
        if (!pending.animals) return nextPlayer;
        return Object.entries(pending.animals).reduce((currentPlayer, [animal, amount]) => {
          if (!this.isAnimalKey(animal) || !amount) return currentPlayer;
          if (pending.storeOnCard) return this.gainAnimals(currentPlayer, pending.cardId, { [animal]: amount }, true);
          return this.animalManager.resolveAnimalGain(currentPlayer, animal, amount, input.animalPlacement);
        }, nextPlayer);
      }

      if (pending.type === "plowField") {
        if (!input.fieldCell) {
          throw new Error("请选择要翻成田地的格子。");
        }
        if (pending.consumeMarker) {
          const markerCount = nextPlayer.cardStates?.[pending.cardId]?.markers[pending.consumeMarker] ?? 0;
          if (markerCount <= 0) {
            throw new Error("这张卡牌没有可用标记。");
          }
          nextPlayer = this.updateCardState(nextPlayer, pending.cardId, (cardState) => ({
            ...cardState,
            markers: { ...cardState.markers, [pending.consumeMarker!]: markerCount - 1 },
          }));
        }
        return this.farmManager.plowField(nextPlayer, input.fieldCell);
      }

      if (pending.type === "buildStable") {
        const cells = input.stableCells?.slice(0, pending.stableAmount ?? 1) ?? [];
        if (cells.length <= 0) {
          throw new Error("请选择要建马厩的格子。");
        }
        return this.farmManager.buildStables(nextPlayer, cells, pending.stableAmount ?? cells.length, 0);
      }

      if (pending.type === "buildRoomOrRenovate") {
        if (input.selectedEffectTypes?.includes("renovate")) {
          return this.farmManager.renovate(nextPlayer);
        }
        const rooms = input.roomCells?.slice(0, 1) ?? [];
        if (rooms.length <= 0) {
          throw new Error("请选择要盖房间的格子，或选择翻修。");
        }
        return this.farmManager.buildRooms(nextPlayer, rooms);
      }

      return nextPlayer;
    });

    return {
      ...nextState,
      pendingCardChoice: this.nextPendingCardChoice(pending),
      actionLog: [...nextState.actionLog, `处理卡牌选择：${pending.label}`],
      lastError: null,
    };
  }

  bakeBread(player: PlayerState, improvementId: string, grain: number): PlayerState {
    if (!player.majorImprovements.includes(improvementId)) {
      throw new Error("玩家没有该烤面包大设施。");
    }
    const card = majorImprovements.find((candidate) => candidate.id === improvementId);
    const effect = card?.effects.find((candidate) => candidate.type === "bakeBread");
    if (!effect || effect.type !== "bakeBread") {
      throw new Error("该大设施不能烤面包。");
    }
    const amount = Math.floor(grain);
    if (amount <= 0 || player.resources.grain < amount) {
      throw new Error("谷物不足，不能烤面包。");
    }
    const grainLimit = effect.grainLimit ?? 1;
    if (amount > grainLimit) {
      throw new Error(`一次烤面包最多只能烤${grainLimit}个谷物。`);
    }
    return {
      ...player,
      resources: {
        ...player.resources,
        grain: player.resources.grain - amount,
        food: player.resources.food + amount * effect.foodPerGrain,
      },
    };
  }

  cook(player: PlayerState, improvementId: string, from: "vegetable" | "sheep" | "boar" | "cattle", amount: number): PlayerState {
    if (!player.majorImprovements.includes(improvementId)) {
      throw new Error("玩家没有该烹饪大设施。");
    }
    const card = majorImprovements.find((candidate) => candidate.id === improvementId);
    const effect = card?.effects.find((candidate) => candidate.type === "cook" && candidate.from === from);
    if (!effect || effect.type !== "cook") {
      throw new Error("该大设施不能进行此转换。");
    }
    if (from === "vegetable") {
      if (player.resources.vegetable < amount) {
        throw new Error("蔬菜不足，不能烹饪。");
      }
      return {
        ...player,
        resources: {
          ...player.resources,
          vegetable: player.resources.vegetable - amount,
          food: player.resources.food + amount * effect.toFood,
        },
      };
    }
    if (player.animals[from] < amount) {
      throw new Error("动物不足，不能烹饪。");
    }
    return {
      ...player,
      animals: {
        ...player.animals,
        [from]: player.animals[from] - amount,
      },
      resources: {
        ...player.resources,
        food: player.resources.food + amount * effect.toFood,
      },
    };
  }

  applyHarvestConversions(player: PlayerState, conversions: HarvestConversionInput[]): PlayerState {
    const totals = conversions.reduce<Map<string, number>>((summary, conversion) => {
      const key = `${conversion.improvementId}::${conversion.conversionId ?? ""}`;
      summary.set(key, (summary.get(key) ?? 0) + conversion.count);
      return summary;
    }, new Map());

    return Array.from(totals.entries()).reduce((currentPlayer, [key, count]) => {
      const [improvementId, conversionId = ""] = key.split("::");
      const amount = Math.floor(count);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("大设施收获转换数量必须是非负整数。");
      }
      if (amount !== count) {
        throw new Error("大设施收获转换数量必须是非负整数。");
      }
      if (amount === 0) return currentPlayer;
      if (amount > 1) {
        throw new Error("每个大设施每次收获最多转换一次。");
      }
      if (!currentPlayer.majorImprovements.includes(improvementId)) {
        const cardEffect = this.cardEffects(improvementId).find((candidate) =>
          candidate.type === "conversion" &&
          (candidate.timing === "harvest" || candidate.timing === "anytime") &&
          (!conversionId || candidate.id === conversionId),
        );
        if (!cardEffect || cardEffect.type !== "conversion" || !currentPlayer.occupations.includes(improvementId) && !currentPlayer.minorImprovements.includes(improvementId)) {
          throw new Error("玩家没有该收获转换卡牌。");
        }
        return this.applyRepeatableConversion(currentPlayer, cardEffect, amount);
      }
      const card = majorImprovements.find((candidate) => candidate.id === improvementId);
      const effect = card?.effects.find((candidate) => candidate.type === "harvestConvert");
      if (!effect || effect.type !== "harvestConvert") {
        throw new Error("该大设施不能在收获喂食时转换资源。");
      }
      const cost = effect.amount * amount;
      if (currentPlayer.resources[effect.resource] < cost) {
        throw new Error("资源不足，不能使用大设施收获转换。");
      }
      return {
        ...currentPlayer,
        resources: {
          ...currentPlayer.resources,
          [effect.resource]: currentPlayer.resources[effect.resource] - cost,
          food: currentPlayer.resources.food + effect.food * amount,
        },
      };
    }, player);
  }

  applyRoundStartFood(player: PlayerState, round: number): PlayerState {
    const dueFood = player.pendingFood.filter((item) => item.round === round).reduce((sum, item) => sum + item.amount, 0);
    if (dueFood === 0) {
      return player;
    }
    return {
      ...player,
      pendingFood: player.pendingFood.filter((item) => item.round !== round),
      resources: {
        ...player.resources,
        food: player.resources.food + dueFood,
      },
    };
  }

  calculateCardBonusPoints(player: PlayerState, allPlayers: PlayerState[] = [player]): { minor: number; occupation: number; bonus: number } {
    return calculateCardBonusPoints(player, allPlayers);
  }

  private payForMajor(player: PlayerState, card: MajorImprovementDefinition, upgradeFromId?: string): PlayerState {
    if (upgradeFromId && card.upgradeFrom?.includes(upgradeFromId) && player.majorImprovements.includes(upgradeFromId)) {
      const upgradeFrom = majorImprovements.find((candidate) => candidate.id === upgradeFromId);
      const discount = upgradeFrom?.cost ?? {};
      const difference = Object.entries(card.cost).reduce<Partial<Record<ResourceKey, number>>>((cost, [resource, amount]) => {
        const key = resource as ResourceKey;
        const required = Math.max(0, amount - (discount[resource] ?? 0));
        if (required > 0) cost[key] = required;
        return cost;
      }, {});
      const paid = this.farmManager.pay(player, this.applyCostModifiers(player, "majorImprovement", difference));
      return {
        ...paid,
        majorImprovements: paid.majorImprovements.filter((id) => id !== upgradeFromId),
      };
    }
    return this.farmManager.pay(player, this.applyCostModifiers(player, "majorImprovement", card.cost as Partial<Record<ResourceKey, number>>));
  }

  private playOccupationForPlayer(player: PlayerState, card: OccupationDefinition, round: number): PlayerState {
    if (!player.occupationHand.includes(card.id)) {
      throw new Error("手牌中没有这张职业卡。");
    }
    const paidPlayer = this.farmManager.pay(player, this.applyCostModifiers(player, "occupation", card.cost));
    const withCardState = this.addPlayedCardState(paidPlayer, card.id, round);
    return {
      ...withCardState,
      occupationHand: paidPlayer.occupationHand.filter((id) => id !== card.id),
      occupations: [...paidPlayer.occupations, card.id],
    };
  }

  private assertMinorRequirements(state: GameState, player: PlayerState, card: MinorImprovementDefinition, round: number): void {
    if (!player.minorImprovementHand.includes(card.id)) {
      throw new Error("手牌中没有这张小设施。");
    }
    card.requirements.forEach((requirement) => this.assertMinorRequirement(state, player, requirement, round));
  }

  private assertMinorRequirement(state: GameState, player: PlayerState, requirement: CardRequirement, round: number): void {
    if (requirement.type === "playedOccupationsAtLeast" && player.occupations.length < requirement.count) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "playedOccupationsAtMost" && player.occupations.length > requirement.count) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "playedOccupationsExactly" && player.occupations.length !== requirement.count) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "animalAtLeast" && player.animals[requirement.animal] < requirement.count) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "fieldsWithCropAtLeast") {
      const fields = countScoringCropFields(player, requirement.crop);
      if (fields < requirement.count) {
        throw new Error(`不满足前置：${requirement.text}。`);
      }
    }
    if (requirement.type === "resourceAtLeast" && player.resources[requirement.resource] < requirement.count) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "roundAtMost" && round > requirement.round) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "roundAtLeast" && round < requirement.round) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "roomMaterialIn" && !requirement.materials.includes(player.farm.roomMaterial)) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "emptyFieldsAtLeast") {
      const emptyFields = player.farm.cells.filter((cell) => cell.field && !cell.field.crop && cell.field.count === 0).length;
      if (emptyFields < requirement.count) {
        throw new Error(`不满足前置：${requirement.text}。`);
      }
    }
    if (requirement.type === "allFarmyardSpacesUsed" && player.farm.cells.some((cell) => !cell.room && !cell.field && !cell.pastureId && !cell.stable)) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "noAnimals" && (player.animals.sheep > 0 || player.animals.boar > 0 || player.animals.cattle > 0)) {
      throw new Error(`不满足前置：${requirement.text}。`);
    }
    if (requirement.type === "workerOnActionSpace") {
      const hasWorker = state.actionSpaces.some((space) => requirement.actionSpaceIds.includes(space.id) && space.occupiedBy === player.id);
      if (!hasWorker) {
        throw new Error(`不满足前置：${requirement.text}。`);
      }
    }
  }

  private payMinorImprovementCost(player: PlayerState, card: MinorImprovementDefinition): PlayerState {
    const resourceCost = this.applyCostModifiers(player, "minorImprovement", getMinorImprovementResourceCost(card, player.workers.length));
    let nextPlayer = this.farmManager.pay(player, resourceCost);
    Object.entries(card.animalCost).forEach(([animal, amount]) => {
      if (!amount || amount <= 0) return;
      nextPlayer = this.farmManager.removeAnimals(nextPlayer, animal as AnimalKey, amount);
    });
    return nextPlayer;
  }

  private addPlayedCardState(player: PlayerState, cardId: string, round: number): PlayerState {
    if (player.cardStates?.[cardId]) return player;
    const runtime: PlayedCardRuntimeState = {
      cardId,
      playedRound: round,
      markers: {},
      storedAnimals: {},
      storedGoods: {},
      bonusPoints: 0,
    };
    return {
      ...player,
      cardStates: {
        ...(player.cardStates ?? {}),
        [cardId]: runtime,
      },
    };
  }

  private applyTriggerForAllPlayers(state: GameState, trigger: CardTrigger, contextOverrides: Partial<CardEffectContext> = {}): GameState {
    return state.players.reduce((nextState, player) => {
      const cardIds = [...player.occupations, ...player.minorImprovements];
      return cardIds.reduce((currentState, cardId) => this.applyCardEffects(currentState, player.id, cardId, this.cardEffects(cardId), trigger, {
        actorId: player.id,
        actionSpaceId: null,
        selectedEffectTypes: [],
        ...contextOverrides,
      }), nextState);
    }, state);
  }

  private applyCardEffects(
    state: GameState,
    ownerId: string,
    cardId: string,
    effects: CardEffect[],
    trigger: CardTrigger,
    context: CardEffectContext,
  ): GameState {
    return effects.reduce((nextState, effect) => {
      if (!this.effectHasTrigger(effect, trigger)) return nextState;
      if ("condition" in effect && effect.condition && !this.conditionMatches(nextState, ownerId, effect.condition, context)) return nextState;
      const onceKey = "onceKey" in effect ? effect.onceKey ?? effect.type : effect.type;
      if ("once" in effect && effect.once && this.hasOnceMarker(nextState, ownerId, cardId, onceKey, trigger)) return nextState;
      const appliedState = this.applyCardEffect(nextState, ownerId, cardId, effect, context);
      if ("once" in effect && effect.once && appliedState !== nextState) {
        return this.markOnce(appliedState, ownerId, cardId, onceKey, trigger);
      }
      return appliedState;
    }, state);
  }

  private applyCardEffect(
    state: GameState,
    ownerId: string,
    cardId: string,
    effect: CardEffect,
    context: CardEffectContext,
  ): GameState {
    if (effect.type === "gainResources") {
      const targetId = effect.target === "actor" ? context.actorId : ownerId;
      return this.updatePlayerOnly(state, targetId, (player) => this.gainResources(player, effect.resources));
    }
    if (effect.type === "gainResourcesByConditionCount") {
      const resources = this.matchConditionCountThreshold(state, ownerId, effect.count, effect.thresholds, context)?.resources;
      return resources ? this.updatePlayerOnly(state, ownerId, (player) => this.gainResources(player, resources)) : state;
    }
    if (effect.type === "gainResourcesForEachConditionCount") {
      const resources = this.conditionCountValues(state, ownerId, effect.count, context).reduce<Partial<Record<ResourceKey, number>>>((summary, count) => {
        const threshold = this.matchThreshold(count, effect.thresholds);
        if (!threshold) return summary;
        Object.entries(threshold.resources).forEach(([resource, amount]) => {
          if (!this.isResourceKey(resource) || !amount) return;
          summary[resource] = (summary[resource] ?? 0) + amount;
        });
        return summary;
      }, {});
      return Object.keys(resources).length > 0 ? this.updatePlayerOnly(state, ownerId, (player) => this.gainResources(player, resources)) : state;
    }
    if (effect.type === "gainResourceUpTo") {
      return this.updatePlayerOnly(state, ownerId, (player) => {
        const amount = Math.max(0, effect.targetAmount - player.resources[effect.resource]);
        return amount > 0 ? this.gainResources(player, { [effect.resource]: amount }) : player;
      });
    }
    if (effect.type === "gainResourcesByInventory") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.gainResources(player, { [effect.gainResource]: Math.floor(player.resources[effect.resource] / effect.divisor) }));
    }
    if (effect.type === "gainResourcesByAnimals") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.gainResources(player, { [effect.gainResource]: Math.floor(player.animals[effect.animal] / effect.divisor) }));
    }
    if (effect.type === "gainResourcesByRooms") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.gainResources(player, this.scaleResources(effect.resourcesPerRoom, this.farmManager.countRooms(player))));
    }
    if (effect.type === "gainResourcesByFamilyMembers") {
      return this.updatePlayerOnly(state, ownerId, (player) => {
        try {
          const paid = effect.cost ? this.farmManager.pay(player, effect.cost) : player;
          const scaled = this.scaleResources(effect.resourcesPerWorker, paid.workers.length);
          return this.gainResources(paid, { ...scaled, ...(effect.resources ?? {}) });
        } catch {
          return player;
        }
      });
    }
    if (effect.type === "gainResourcesByFields") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.gainResources(player, this.scaleResources(effect.resourcesPerField, countScoringCropFields(player, effect.crop))));
    }
    if (effect.type === "gainResourcesByPlayedCardCount") {
      return this.updatePlayerOnly(state, ownerId, (player) => {
        try {
          const paid = effect.cost ? this.farmManager.pay(player, effect.cost) : player;
          const source = this.playerForCountSource(state, ownerId, context, effect.countSource ?? "owner") ?? paid;
          return this.gainResources(paid, this.scaleResources(effect.resourcesPerCard, this.playedCardCount(source, effect.cardKind)));
        } catch {
          return player;
        }
      });
    }
    if (effect.type === "gainGoods") {
      if (this.goodsHaveAnimals(effect.goods)) {
        return this.createPendingCardChoice(state, ownerId, cardId, "gainAnimals", {
          label: "选择动物处理方式",
          animals: this.pickAnimals(effect.goods),
          resources: this.pickResources(effect.goods),
          cost: effect.cost,
          removeWorkers: effect.removeWorkers,
        });
      }
      return this.updatePlayerOnly(state, ownerId, (player) => this.gainGoodsWithCost(player, effect));
    }
    if (effect.type === "gainAnimals") {
      if (!effect.storeOnCard) {
        return this.createPendingCardChoice(state, ownerId, cardId, "gainAnimals", {
          label: "选择动物处理方式",
          animals: effect.animals,
          cost: effect.cost,
        });
      }
      return this.updatePlayerOnly(state, ownerId, (player) => {
        try {
          const paid = effect.cost ? this.farmManager.pay(player, effect.cost) : player;
          const withAnimals = this.gainAnimals(paid, cardId, effect.animals, Boolean(effect.storeOnCard));
          return this.hasGainedAnimals(paid, withAnimals, effect.animals) ? withAnimals : player;
        } catch {
          return player;
        }
      });
    }
    if (effect.type === "gainAnimalsByConditionCount") {
      const threshold = this.matchConditionCountThreshold(state, ownerId, effect.count, effect.thresholds, context);
      if (!threshold) return state;
      return this.createPendingCardChoice(state, ownerId, cardId, "gainAnimals", {
        label: "选择动物处理方式",
        animals: threshold.animals,
        cost: effect.cost,
      });
    }
    if (effect.type === "gainPlayerCountResources") {
      const playerCount = Math.min(6, Math.max(1, state.players.length)) as 1 | 2 | 3 | 4 | 5 | 6;
      const gains = effect.byPlayerCount[playerCount] ?? {};
      if (this.goodsHaveAnimals(gains)) {
        return this.createPendingCardChoice(state, ownerId, cardId, "gainAnimals", {
          label: "选择动物处理方式",
          animals: this.pickAnimals(gains),
          resources: this.pickResources(gains),
        });
      }
      return this.updatePlayerOnly(state, ownerId, (player) => this.gainMixedGoods(player, gains));
    }
    if (effect.type === "scheduleResources") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.scheduleGoodsOnceIfNeeded(player, state.round, cardId, effect, { resources: effect.resources }));
    }
    if (effect.type === "scheduleAnimals") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.scheduleGoodsOnceIfNeeded(player, state.round, cardId, effect, { animals: effect.animals }));
    }
    if (effect.type === "placeMarkers") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.updateCardState(player, cardId, (cardState) => ({
        ...cardState,
        markers: { ...cardState.markers, [effect.marker]: (cardState.markers[effect.marker] ?? 0) + effect.amount },
      })));
    }
    if (effect.type === "plowField") {
      if (!this.canCreatePlowChoice(state, ownerId, cardId, effect)) return state;
      return this.createPendingCardChoice(state, ownerId, cardId, "plowField", {
        label: "选择要翻的田地",
        cost: effect.cost,
        plowAmount: effect.amount,
        consumeMarker: effect.consumeMarker,
      });
    }
    if (effect.type === "buildStable") {
      if (!this.canCreateStableChoice(state, ownerId, effect)) return state;
      return this.createPendingCardChoice(state, ownerId, cardId, "buildStable", {
        label: "选择要建马厩的格子",
        cost: effect.cost,
        stableAmount: effect.amount,
      });
    }
    if (effect.type === "renovateHouse") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.renovateByCard(player, Boolean(effect.freeReed)));
    }
    if (effect.type === "buildRoomOrRenovate") {
      if (!this.canCreateRoomOrRenovateChoice(state, ownerId)) return state;
      return this.createPendingCardChoice(state, ownerId, cardId, "buildRoomOrRenovate", {
        label: "选择盖房间或翻修",
      });
    }
    if (effect.type === "createFreePasture") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.farmManager.createFreePasture(player, effect.cells));
    }
    if (effect.type === "addBonusPoints") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.addCardBonusPoints(player, cardId, effect.amount));
    }
    if (effect.type === "bonusByCompletedRounds") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.addCardBonusPoints(player, cardId, Math.max(0, state.round - 1)));
    }
    if (effect.type === "returnAccumulatedResource") {
      return this.returnAccumulatedResource(state, ownerId, effect, context.actionSpaceId);
    }
    if (effect.type === "returnAccumulatedByThreshold") {
      return this.returnAccumulatedByThreshold(state, ownerId, effect, context);
    }
    if (effect.type === "drawCards") {
      return this.drawCards(state, ownerId, effect);
    }
    if (effect.type === "buyGoods") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.buyGoods(player, effect.cost, effect.goods));
    }
    if (effect.type === "claimAccumulated") {
      return this.claimAccumulated(state, ownerId, cardId, effect, context);
    }
    if (effect.type === "storeGoods") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.storeGoods(player, cardId, effect.resources ?? {}));
    }
    if (effect.type === "claimStoredGoods") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.claimStoredGoods(player, cardId, Boolean(effect.once)));
    }
    if (effect.type === "addAccumulated") {
      return this.addAccumulated(state, effect.actionSpaceIds, effect.resources);
    }
    if (effect.type === "autoPlayCard") {
      return this.autoPlayCard(state, ownerId, effect);
    }
    if (effect.type === "bakeBread") {
      return this.applyCardBakeBread(state, ownerId, effect, context);
    }
    if (effect.type === "sowOneField") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.sowOneField(player, effect.crop));
    }
    if (effect.type === "moveSownField") {
      return this.updatePlayerOnly(state, ownerId, (player) => this.moveSownField(player));
    }
    if (effect.type === "createActionSpace") {
      if (state.actionSpaces.some((space) => space.id === effect.id)) return state;
      return {
        ...state,
        actionSpaces: [
          ...state.actionSpaces,
          {
            id: effect.id,
            name: effect.name,
            type: "choice",
            ownerId,
            sourceCardId: cardId,
            visibility: effect.visibility ?? "private",
            ownerPayment: effect.ownerPayment ?? {},
            cost: {},
            gain: {},
            prerequisites: [],
            rules: [effect.visibility === "public" ? "卡牌创建的公共行动格。" : "卡牌创建的私人行动格。"],
            restrictions: [],
            occupiedBy: null,
            accumulated: {},
            effects: effect.effects,
          },
        ],
      };
    }
    return state;
  }

  private effectHasTrigger(effect: CardEffect, trigger: CardTrigger): boolean {
    return "trigger" in effect && effect.trigger === trigger;
  }

  private cardEffects(cardId: string): CardEffect[] {
    return getMinorImprovement(cardId)?.effects ?? getOccupation(cardId)?.effects ?? [];
  }

  private createPendingCardChoice(
    state: GameState,
    ownerId: string,
    cardId: string,
    type: NonNullable<GameState["pendingCardChoice"]>["type"],
    choice: Omit<NonNullable<GameState["pendingCardChoice"]>, "id" | "playerId" | "cardId" | "type" | "createdRound" | "remainingChoices">,
  ): GameState {
    if (!this.canPayCardChoiceCost(state, ownerId, choice.cost)) return state;
    const nextChoice = this.buildPendingCardChoice(
      state,
      ownerId,
      cardId,
      type,
      choice,
      state.pendingCardChoice ? (state.pendingCardChoice.remainingChoices?.length ?? 0) + 1 : 0,
    );
    if (state.pendingCardChoice) {
      return {
        ...state,
        pendingCardChoice: {
          ...state.pendingCardChoice,
          remainingChoices: [...(state.pendingCardChoice.remainingChoices ?? []), nextChoice],
        },
      };
    }
    return {
      ...state,
      pendingCardChoice: nextChoice,
    };
  }

  private buildPendingCardChoice(
    state: GameState,
    ownerId: string,
    cardId: string,
    type: NonNullable<GameState["pendingCardChoice"]>["type"],
    choice: Omit<NonNullable<GameState["pendingCardChoice"]>, "id" | "playerId" | "cardId" | "type" | "createdRound" | "remainingChoices">,
    index: number,
  ): NonNullable<GameState["pendingCardChoice"]> {
    return {
      id: `${cardId}:${type}:${ownerId}:${state.round}:${index}`,
      playerId: ownerId,
      cardId,
      type,
      createdRound: state.round,
      ...choice,
    };
  }

  private nextPendingCardChoice(pending: NonNullable<GameState["pendingCardChoice"]>): GameState["pendingCardChoice"] {
    const [nextChoice, ...remainingChoices] = pending.remainingChoices ?? [];
    return nextChoice ? { ...nextChoice, remainingChoices } : null;
  }

  private canCreatePlowChoice(
    state: GameState,
    ownerId: string,
    cardId: string,
    effect: Extract<CardEffect, { type: "plowField" }>,
  ): boolean {
    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return false;
    if (!this.canPayCardChoiceCost(state, ownerId, effect.cost)) return false;
    if (effect.consumeMarker && (player.cardStates?.[cardId]?.markers[effect.consumeMarker] ?? 0) <= 0) return false;
    return Boolean(this.findLegalFieldCell(player));
  }

  private canCreateStableChoice(state: GameState, ownerId: string, effect: Extract<CardEffect, { type: "buildStable" }>): boolean {
    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return false;
    if (!this.canPayCardChoiceCost(state, ownerId, effect.cost)) return false;
    return Boolean(this.findLegalStableCell(player));
  }

  private canCreateRoomOrRenovateChoice(state: GameState, ownerId: string): boolean {
    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return false;
    if (this.findLegalRoomCell(player)) return true;
    try {
      this.farmManager.renovate(player);
      return true;
    } catch {
      return false;
    }
  }

  private canPayCardChoiceCost(state: GameState, ownerId: string, cost?: Partial<Record<ResourceKey, number>>): boolean {
    if (!cost) return true;
    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return false;
    try {
      this.farmManager.assertCanPay(player, cost);
      return true;
    } catch {
      return false;
    }
  }

  private gainResources(player: PlayerState, resources: Partial<Record<ResourceKey, number>>): PlayerState {
    const nextResources = { ...player.resources };
    Object.entries(resources).forEach(([resource, amount]) => {
      if (!this.isResourceKey(resource) || !amount) return;
      nextResources[resource] += amount;
    });
    return { ...player, resources: nextResources };
  }

  private scaleResources(resources: Partial<Record<ResourceKey, number>>, multiplier: number): Partial<Record<ResourceKey, number>> {
    return Object.fromEntries(
      Object.entries(resources)
        .filter((entry): entry is [ResourceKey, number] => this.isResourceKey(entry[0]) && Boolean(entry[1]))
        .map(([resource, amount]) => [resource, amount * multiplier]),
    );
  }

  private gainMixedGoods(player: PlayerState, goods: Partial<Record<ResourceKey | AnimalKey, number>>): PlayerState {
    return Object.entries(goods).reduce((nextPlayer, [key, amount]) => {
      if (!amount) return nextPlayer;
      if (this.isResourceKey(key)) return this.gainResources(nextPlayer, { [key]: amount });
      if (this.isAnimalKey(key)) return this.animalManager.resolveAnimalGain(nextPlayer, key, amount);
      return nextPlayer;
    }, player);
  }

  private goodsHaveAnimals(goods: Partial<Record<ResourceKey | AnimalKey, number>>): boolean {
    return Object.entries(goods).some(([key, amount]) => this.isAnimalKey(key) && Boolean(amount && amount > 0));
  }

  private pickAnimals(goods: Partial<Record<ResourceKey | AnimalKey, number>>): Partial<Record<AnimalKey, number>> {
    return Object.entries(goods).reduce<Partial<Record<AnimalKey, number>>>((animals, [key, amount]) => {
      if (this.isAnimalKey(key) && amount && amount > 0) animals[key] = amount;
      return animals;
    }, {});
  }

  private pickResources(goods: Partial<Record<ResourceKey | AnimalKey, number>>): Partial<Record<ResourceKey, number>> {
    return Object.entries(goods).reduce<Partial<Record<ResourceKey, number>>>((resources, [key, amount]) => {
      if (this.isResourceKey(key) && amount && amount > 0) resources[key] = amount;
      return resources;
    }, {});
  }

  private buyGoods(player: PlayerState, cost: Partial<Record<ResourceKey, number>>, goods: Partial<Record<ResourceKey | AnimalKey, number>>): PlayerState {
    try {
      const paid = this.farmManager.pay(player, cost);
      return this.gainMixedGoods(paid, goods);
    } catch {
      return player;
    }
  }

  private gainGoodsWithCost(player: PlayerState, effect: Extract<CardEffect, { type: "gainGoods" }>): PlayerState {
    try {
      let nextPlayer = effect.cost ? this.farmManager.pay(player, effect.cost) : player;
      if (effect.removeWorkers && effect.removeWorkers > 0) {
        if (nextPlayer.workers.length <= 2 || nextPlayer.workers.length < effect.removeWorkers) {
          return player;
        }
        nextPlayer = {
          ...nextPlayer,
          workers: nextPlayer.workers.slice(0, nextPlayer.workers.length - effect.removeWorkers),
        };
      }
      const before = nextPlayer;
      const withGoods = this.gainMixedGoods(nextPlayer, effect.goods);
      const expectedAnimals = Object.entries(effect.goods).reduce<Partial<Record<AnimalKey, number>>>((animals, [key, amount]) => {
        if (this.isAnimalKey(key) && amount) animals[key] = amount;
        return animals;
      }, {});
      return this.hasGainedAnimals(before, withGoods, expectedAnimals) ? withGoods : player;
    } catch {
      return player;
    }
  }

  private applyRepeatableConversion(player: PlayerState, effect: Extract<CardEffect, { type: "conversion" }>, amount: number): PlayerState {
    let nextPlayer = player;
    for (let index = 0; index < amount; index += 1) {
      Object.entries(effect.from).forEach(([key, cost]) => {
        if (!cost) return;
        if (this.isResourceKey(key)) {
          if (nextPlayer.resources[key] < cost) throw new Error("资源不足，不能使用卡牌转换。");
          nextPlayer = this.farmManager.pay(nextPlayer, { [key]: cost });
        }
        if (this.isAnimalKey(key)) {
          if (nextPlayer.animals[key] < cost) throw new Error("动物不足，不能使用卡牌转换。");
          nextPlayer = this.farmManager.removeAnimals(nextPlayer, key, cost);
        }
      });
      nextPlayer = this.gainMixedGoods(nextPlayer, effect.to);
    }
    return nextPlayer;
  }

  private hasOnceMarker(state: GameState, ownerId: string, cardId: string, key: string, trigger: CardTrigger): boolean {
    const player = state.players.find((candidate) => candidate.id === ownerId);
    return (player?.cardStates?.[cardId]?.markers[this.onceMarker(key, trigger)] ?? 0) > 0;
  }

  private markOnce(state: GameState, ownerId: string, cardId: string, key: string, trigger: CardTrigger): GameState {
    return this.updatePlayerOnly(state, ownerId, (player) => this.updateCardState(player, cardId, (cardState) => ({
      ...cardState,
      markers: {
        ...cardState.markers,
        [this.onceMarker(key, trigger)]: 1,
      },
    })));
  }

  private onceMarker(key: string, trigger: CardTrigger): string {
    return `once:${trigger}:${key}`;
  }

  private drawCards(state: GameState, ownerId: string, effect: Extract<CardEffect, { type: "drawCards" }>): GameState {
    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return state;
    if (effect.cost) {
      try {
        this.farmManager.assertCanPay(player, effect.cost);
      } catch {
        return state;
      }
    }
    const deckKey = effect.deck === "minorImprovement" ? "minorImprovementDeck" : "occupationDeck";
    const handKey = effect.deck === "minorImprovement" ? "minorImprovementHand" : "occupationHand";
    const drawn = state[deckKey].slice(0, effect.amount);
    if (drawn.length === 0) return state;
    const paidPlayers = state.players.map((candidate) => {
      if (candidate.id !== ownerId) return candidate;
      const paid = effect.cost ? this.farmManager.pay(candidate, effect.cost) : candidate;
      return {
        ...paid,
        [handKey]: [...paid[handKey], ...drawn],
      };
    });
    return {
      ...state,
      [deckKey]: state[deckKey].slice(drawn.length),
      players: paidPlayers,
    };
  }

  private claimAccumulated(state: GameState, ownerId: string, cardId: string, effect: Extract<CardEffect, { type: "claimAccumulated" }>, context: CardEffectContext): GameState {
    const actionSpaceId = effect.actionSpaceId ?? context.actionSpaceId;
    if (!actionSpaceId) return state;
    const marker = `claimed:${actionSpaceId}`;
    const owner = state.players.find((player) => player.id === ownerId);
    if (!owner) return state;
    if (effect.once && (owner.cardStates?.[cardId]?.markers[marker] ?? 0) > 0) return state;
    const actionSpace = state.actionSpaces.find((space) => space.id === actionSpaceId);
    if (!actionSpace) return state;
    const resources = Object.entries(actionSpace.accumulated).reduce<Partial<Record<ResourceKey, number>>>((goods, [key, amount]) => {
      if (this.isResourceKey(key) && (!effect.resource || effect.resource === key) && amount > 0) {
        goods[key] = amount;
      }
      return goods;
    }, {});
    if (Object.keys(resources).length === 0) return state;
    const targetId = effect.target === "actor" ? context.actorId : ownerId;
    return {
      ...state,
      players: state.players.map((player) => {
        let nextPlayer = player.id === targetId ? this.gainResources(player, resources) : player;
        if (player.id === ownerId && effect.once) {
          nextPlayer = this.updateCardState(nextPlayer, cardId, (cardState) => ({
            ...cardState,
            markers: { ...cardState.markers, [marker]: 1 },
          }));
        }
        return nextPlayer;
      }),
      actionSpaces: state.actionSpaces.map((space) =>
        space.id === actionSpaceId
          ? {
              ...space,
              accumulated: Object.fromEntries(Object.entries(space.accumulated).map(([key, amount]) => [key, this.isResourceKey(key) && (!effect.resource || effect.resource === key) ? 0 : amount])),
            }
          : space,
      ),
    };
  }

  private storeGoods(player: PlayerState, cardId: string, resources: Partial<Record<ResourceKey, number>>): PlayerState {
    return this.updateCardState(player, cardId, (cardState) => ({
      ...cardState,
      storedGoods: Object.entries(resources).reduce<Partial<ResourceState>>((goods, [resource, amount]) => {
        if (!this.isResourceKey(resource) || !amount) return goods;
        goods[resource] = (goods[resource] ?? 0) + amount;
        return goods;
      }, { ...cardState.storedGoods }),
    }));
  }

  private claimStoredGoods(player: PlayerState, cardId: string, once: boolean): PlayerState {
    const cardState = player.cardStates?.[cardId];
    if (!cardState || once && cardState.flipped) return player;
    const resources = Object.entries(cardState.storedGoods).reduce<Partial<Record<ResourceKey, number>>>((goods, [resource, amount]) => {
      if (this.isResourceKey(resource) && amount && amount > 0) goods[resource] = amount;
      return goods;
    }, {});
    if (Object.keys(resources).length === 0) return player;
    return this.updateCardState(this.gainResources(player, resources), cardId, (nextCardState) => ({
      ...nextCardState,
      storedGoods: {},
      flipped: once ? true : nextCardState.flipped,
    }));
  }

  private addAccumulated(state: GameState, actionSpaceIds: string[], resources: Partial<Record<ResourceKey, number>>): GameState {
    return {
      ...state,
      actionSpaces: state.actionSpaces.map((space) =>
        actionSpaceIds.includes(space.id)
          ? {
              ...space,
              accumulated: Object.entries(resources).reduce<Record<string, number>>((accumulated, [resource, amount]) => {
                if (!this.isResourceKey(resource) || !amount) return accumulated;
                accumulated[resource] = (accumulated[resource] ?? 0) + amount;
                return accumulated;
              }, { ...space.accumulated }),
            }
          : space,
      ),
    };
  }

  private autoPlayCard(state: GameState, ownerId: string, effect: Extract<CardEffect, { type: "autoPlayCard" }>): GameState {
    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return state;
    if (effect.cost) {
      try {
        this.farmManager.assertCanPay(player, effect.cost);
      } catch {
        return state;
      }
    }
    const kind = effect.kind === "occupationOrMinorImprovement"
      ? player.occupationHand.length > 0
        ? "occupation"
        : "minorImprovement"
      : effect.kind;
    const cardId = kind === "occupation" ? player.occupationHand[0] : player.minorImprovementHand[0];
    if (!cardId) return state;
    const paidState = effect.cost
      ? this.updatePlayerOnly(state, ownerId, (candidate) => this.farmManager.pay(candidate, effect.cost!))
      : state;
    try {
      return kind === "occupation" ? this.playOccupation(paidState, ownerId, cardId) : this.playMinorImprovement(paidState, ownerId, cardId);
    } catch {
      return state;
    }
  }

  private applyCardBakeBread(
    state: GameState,
    ownerId: string,
    _effect: Extract<CardEffect, { type: "bakeBread" }>,
    context: CardEffectContext,
  ): GameState {
    if (ownerId !== context.actorId) return state;
    if (!context.bake) return state;
    return this.updatePlayerOnly(state, ownerId, (player) => this.bakeBread(player, context.bake!.improvementId, context.bake!.grain));
  }

  private sowOneField(player: PlayerState, crop?: "grain" | "vegetable"): PlayerState {
    const targetCrop = crop ?? (player.resources.vegetable > 0 ? "vegetable" : "grain");
    if (player.resources[targetCrop] <= 0) return player;
    const target = player.farm.cells.find((cell) => cell.field && !cell.field.crop && cell.field.count === 0);
    if (!target) return player;
    try {
      return this.farmManager.sow(player, targetCrop, [{ row: target.row, col: target.col }]);
    } catch {
      return player;
    }
  }

  private moveSownField(player: PlayerState): PlayerState {
    const source = player.farm.cells.find((cell) => cell.field?.crop && cell.field.count >= 2);
    const target = player.farm.cells.find((cell) => !cell.room && !cell.field && !cell.pastureId && !cell.stable);
    if (!source || !target) return player;
    return {
      ...player,
      farm: {
        ...player.farm,
        cells: player.farm.cells.map((cell) => {
          if (cell.row === source.row && cell.col === source.col) return { ...cell, field: null };
          if (cell.row === target.row && cell.col === target.col) return { ...cell, field: source.field };
          return cell;
        }),
      },
    };
  }

  private gainAnimals(player: PlayerState, cardId: string, animals: Partial<Record<AnimalKey, number>>, storeOnCard: boolean): PlayerState {
    return Object.entries(animals).reduce((nextPlayer, [animal, amount]) => {
      if (!this.isAnimalKey(animal) || !amount) return nextPlayer;
      if (!storeOnCard) return this.animalManager.resolveAnimalGain(nextPlayer, animal, amount);
      return this.updateCardState({
        ...nextPlayer,
        animals: {
          ...nextPlayer.animals,
          [animal]: nextPlayer.animals[animal] + amount,
        },
      }, cardId, (cardState) => ({
        ...cardState,
        storedAnimals: {
          ...cardState.storedAnimals,
          [animal]: (cardState.storedAnimals[animal] ?? 0) + amount,
        },
      }));
    }, player);
  }

  private scheduleGoods(player: PlayerState, currentRound: number, cardId: string, schedule: CardSchedule, goods: Pick<PendingGood, "animals" | "resources">): PlayerState {
    const rounds = this.scheduleRounds(currentRound, schedule);
    const pendingGoods = rounds.map((round) => ({
      round,
      sourceCardId: cardId,
      ...goods,
    }));
    return {
      ...player,
      pendingGoods: [...(player.pendingGoods ?? []), ...pendingGoods],
    };
  }

  private scheduleGoodsOnceIfNeeded(
    player: PlayerState,
    currentRound: number,
    cardId: string,
    effect: Extract<CardEffect, { type: "scheduleAnimals" | "scheduleResources" }>,
    goods: Pick<PendingGood, "animals" | "resources">,
  ): PlayerState {
    if (effect.trigger !== "roundStart") {
      return this.scheduleGoods(player, currentRound, cardId, effect.schedule, goods);
    }
    const marker = `scheduled:${JSON.stringify(effect.schedule)}:${JSON.stringify(goods)}`;
    if ((player.cardStates?.[cardId]?.markers[marker] ?? 0) > 0) {
      return player;
    }
    return this.updateCardState(this.scheduleGoods(player, currentRound, cardId, effect.schedule, goods), cardId, (cardState) => ({
      ...cardState,
      markers: {
        ...cardState.markers,
        [marker]: 1,
      },
    }));
  }

  private scheduleRounds(currentRound: number, schedule: CardSchedule): number[] {
    if (schedule.type === "relativeRounds") {
      return Array.from({ length: schedule.count }, (_, index) => currentRound + index + 1).filter((round) => round <= 14);
    }
    if (schedule.type === "fixedRounds") {
      return schedule.rounds.filter((round) => round > currentRound && round <= 14);
    }
    return Array.from({ length: 14 - currentRound }, (_, index) => currentRound + index + 1).filter((round) => round % 2 === 0);
  }

  private applyPendingGoods(player: PlayerState, round: number): PlayerState {
    const due = (player.pendingGoods ?? []).filter((item) => item.round === round);
    if (due.length === 0) return player;
    const withGoods = due.reduce((nextPlayer, item) => {
      let updated = item.resources ? this.gainResources(nextPlayer, item.resources) : nextPlayer;
      if (item.animals) {
        updated = Object.entries(item.animals).reduce((animalPlayer, [animal, amount]) => {
          if (!this.isAnimalKey(animal) || !amount) return animalPlayer;
          return this.animalManager.resolveAnimalGain(animalPlayer, animal, amount);
        }, updated);
      }
      return updated;
    }, player);
    return {
      ...withGoods,
      pendingGoods: (withGoods.pendingGoods ?? []).filter((item) => item.round !== round),
    };
  }

  private plowByCard(player: PlayerState, cardId: string, amount: number, consumeMarker?: string, cost?: Partial<Record<ResourceKey, number>>): PlayerState {
    let nextPlayer = player;
    for (let index = 0; index < amount; index += 1) {
      if (consumeMarker) {
        const markerCount = nextPlayer.cardStates?.[cardId]?.markers[consumeMarker] ?? 0;
        if (markerCount <= 0) return nextPlayer;
        nextPlayer = this.updateCardState(nextPlayer, cardId, (cardState) => ({
          ...cardState,
          markers: { ...cardState.markers, [consumeMarker]: markerCount - 1 },
        }));
      }
      if (cost) {
        try {
          nextPlayer = this.farmManager.pay(nextPlayer, cost);
        } catch {
          return nextPlayer;
        }
      }
      const target = this.findLegalFieldCell(nextPlayer);
      if (!target) return nextPlayer;
      nextPlayer = this.farmManager.plowField(nextPlayer, target);
    }
    return nextPlayer;
  }

  private buildStableByCard(player: PlayerState, amount: number, cost?: Partial<Record<ResourceKey, number>>): PlayerState {
    let nextPlayer = player;
    for (let index = 0; index < amount; index += 1) {
      if (cost) {
        try {
          this.farmManager.assertCanPay(nextPlayer, cost);
        } catch {
          return nextPlayer;
        }
      }
      const target = this.findLegalStableCell(nextPlayer);
      if (!target) return nextPlayer;
      try {
        const paidPlayer = cost ? this.farmManager.pay(nextPlayer, cost) : nextPlayer;
        nextPlayer = this.farmManager.buildStables(paidPlayer, [target], 1, 0);
      } catch {
        return nextPlayer;
      }
    }
    return nextPlayer;
  }

  private buildRoomOrRenovateByCard(player: PlayerState, context: CardEffectContext): PlayerState {
    if (context.input?.roomCells?.length) {
      return this.farmManager.buildRooms(player, context.input.roomCells.slice(0, 1));
    }
    if (context.input?.selectedEffectTypes?.includes("renovate")) {
      return this.farmManager.renovate(player);
    }
    const target = this.findLegalRoomCell(player);
    if (target) {
      try {
        return this.farmManager.buildRooms(player, [target]);
      } catch {
        return player;
      }
    }
    try {
      return this.farmManager.renovate(player);
    } catch {
      return player;
    }
  }

  private renovateByCard(player: PlayerState, freeReed: boolean): PlayerState {
    try {
      if (!freeReed) return this.farmManager.renovate(player);
      const withTemporaryReed = {
        ...player,
        resources: {
          ...player.resources,
          reed: player.resources.reed + 1,
        },
      };
      const renovated = this.farmManager.renovate(withTemporaryReed);
      return {
        ...renovated,
        resources: {
          ...renovated.resources,
          reed: Math.min(renovated.resources.reed, player.resources.reed),
        },
      };
    } catch {
      return player;
    }
  }

  private findLegalFieldCell(player: PlayerState): { row: number; col: number } | null {
    for (const cell of player.farm.cells) {
      if (cell.room || cell.field || cell.pastureId || cell.stable) continue;
      try {
        this.farmManager.plowField(player, cell);
        return { row: cell.row, col: cell.col };
      } catch {
        // Try the next legal-looking cell.
      }
    }
    return null;
  }

  private findLegalStableCell(player: PlayerState): { row: number; col: number } | null {
    for (const cell of player.farm.cells) {
      if (cell.room || cell.field || cell.stable) continue;
      return { row: cell.row, col: cell.col };
    }
    return null;
  }

  private findLegalRoomCell(player: PlayerState): { row: number; col: number } | null {
    for (const cell of player.farm.cells) {
      if (cell.room || cell.field || cell.pastureId || cell.stable) continue;
      try {
        this.farmManager.buildRooms(player, [cell]);
        return { row: cell.row, col: cell.col };
      } catch {
        // Try the next legal-looking cell.
      }
    }
    return null;
  }

  private addCardBonusPoints(player: PlayerState, cardId: string, amount: number): PlayerState {
    if (amount <= 0) return player;
    return this.updateCardState(player, cardId, (cardState) => ({
      ...cardState,
      bonusPoints: cardState.bonusPoints + amount,
    }));
  }

  private returnAccumulatedResource(state: GameState, ownerId: string, effect: Extract<CardEffect, { type: "returnAccumulatedResource" }>, actionSpaceId: string | null): GameState {
    if (!actionSpaceId) return state;
    const owner = state.players.find((player) => player.id === ownerId);
    if (!owner || owner.resources[effect.resource] < effect.amount) return state;
    return {
      ...state,
      players: state.players.map((player) =>
        player.id === ownerId
          ? {
              ...player,
              resources: {
                ...player.resources,
                [effect.resource]: player.resources[effect.resource] - effect.amount,
                food: player.resources.food + effect.gainFood,
              },
            }
          : player,
      ),
      actionSpaces: state.actionSpaces.map((space) =>
        space.id === actionSpaceId
          ? {
              ...space,
              accumulated: {
                ...space.accumulated,
                [effect.resource]: (space.accumulated[effect.resource] ?? 0) + effect.amount,
              },
            }
          : space,
      ),
    };
  }

  private returnAccumulatedByThreshold(
    state: GameState,
    ownerId: string,
    effect: Extract<CardEffect, { type: "returnAccumulatedByThreshold" }>,
    context: CardEffectContext,
  ): GameState {
    if (!context.actionSpaceId) return state;
    const takenCount = this.countConditionMatches(state, ownerId, { type: "accumulatedTaken", resource: effect.resource }, context);
    const threshold = this.matchThreshold(takenCount, effect.thresholds);
    if (!threshold || threshold.returnAmount <= 0) return state;
    const returnResource = effect.resource ?? this.singleTakenResource(context);
    if (!returnResource) return state;
    const owner = state.players.find((player) => player.id === ownerId);
    if (!owner || owner.resources[returnResource] < threshold.returnAmount) return state;
    const paidOwner = {
      ...owner,
      resources: {
        ...owner.resources,
        [returnResource]: owner.resources[returnResource] - threshold.returnAmount,
      },
    };
    const rewardedOwner = this.gainMixedGoods(paidOwner, { ...(threshold.resources ?? {}), ...(threshold.animals ?? {}) });
    if (threshold.animals && !this.hasGainedAnimals(paidOwner, rewardedOwner, threshold.animals)) {
      return state;
    }
    return {
      ...state,
      players: state.players.map((player) =>
        player.id === ownerId ? rewardedOwner : player,
      ),
      actionSpaces: state.actionSpaces.map((space) =>
        space.id === context.actionSpaceId
          ? {
              ...space,
              accumulated: {
                ...space.accumulated,
                [returnResource]: (space.accumulated[returnResource] ?? 0) + threshold.returnAmount,
              },
            }
          : space,
      ),
    };
  }

  private updateCardState(player: PlayerState, cardId: string, updater: (state: PlayedCardRuntimeState) => PlayedCardRuntimeState): PlayerState {
    const existing = player.cardStates?.[cardId] ?? {
      cardId,
      playedRound: 0,
      markers: {},
      storedAnimals: {},
      storedGoods: {},
      bonusPoints: 0,
    };
    return {
      ...player,
      cardStates: {
        ...(player.cardStates ?? {}),
        [cardId]: updater(existing),
      },
    };
  }

  private conditionMatches(
    state: GameState,
    ownerId: string,
    condition: CardCondition,
    context: CardEffectContext,
  ): boolean {
    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return false;
    if (condition.type === "allOf") return condition.conditions.every((item) => this.conditionMatches(state, ownerId, item, context));
    if (condition.type === "anyOf") return condition.conditions.some((item) => this.conditionMatches(state, ownerId, item, context));
    if (condition.type === "actionGroup") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return condition.groups.some((group) => this.actionGroups(context.actionSpaceId, context.selectedEffectTypes).includes(group));
    }
    if (condition.type === "actionId") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return Boolean(context.actionSpaceId && condition.ids.includes(context.actionSpaceId));
    }
    if (condition.type === "selectedEffectType") {
      return condition.types.some((type) => context.selectedEffectTypes.includes(type));
    }
    if (condition.type === "bakeBreadUsed") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return Boolean(context.bakeBreadUsed);
    }
    if (condition.type === "accumulatedTaken") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return this.accumulatedTakenAmount(context, condition.resource) >= (condition.atLeast ?? 1);
    }
    if (condition.type === "actionOrdinalAtLeast") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return (state.lastActionOrdinalByPlayerId[condition.actor === "any" ? context.actorId : ownerId] ?? 0) >= condition.count;
    }
    if (condition.type === "actionSpaceEmpty") {
      return condition.ids.every((id) => {
        const actionSpace = state.actionSpaces.find((space) => space.id === id);
        return Boolean(actionSpace && !actionSpace.occupiedBy);
      });
    }
    if (condition.type === "actionSpacesOccupied") return this.countConditionMatches(state, ownerId, { type: "actionSpacesOccupied", ids: condition.ids }, context) === condition.ids.length;
    if (condition.type === "actionSpacesWithAccumulated") {
      return this.countConditionMatches(state, ownerId, {
        type: "actionSpacesWithAccumulated",
        ids: condition.ids,
        resource: condition.resource,
        atLeast: condition.atLeast,
      }, context) >= (condition.minCount ?? condition.ids.length);
    }
    if (condition.type === "playersWithAnimalAtLeast") {
      return this.countConditionMatches(state, ownerId, {
        type: "playersWithAnimalAtLeast",
        animal: condition.animal,
        count: condition.animalCount,
      }, context) >= condition.minPlayers;
    }
    if (condition.type === "newPastureCreated") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return this.createdPastures(context).some((pasture) => {
        const cells = pasture.cells.length;
        if (cells < (condition.minCells ?? 1)) return false;
        if (!condition.previouslyUnfenced) return true;
        return pasture.cells.every((cell) => this.wasUnfencedCell(context.actorBefore, cell));
      });
    }
    if (condition.type === "roundCardRevealed") {
      const latestCard = state.roundCards[state.roundCards.length - 1];
      return Boolean(latestCard && condition.ids.includes(latestCard.id));
    }
    if (condition.type === "playerCountAtLeast") {
      return state.players.length >= condition.count;
    }
    if (condition.type === "otherPlayerHasMore") {
      return state.players.some((candidate) => candidate.id !== ownerId && condition.metrics.every((metric) => this.metricValue(candidate, metric) > this.metricValue(player, metric)));
    }
    if (condition.type === "ownedMajorImprovementCostAtLeast") {
      return this.ownedMajorImprovementCost(player, condition.resources) >= condition.count;
    }
    if (condition.type === "uniquePlayerWithRoomsExactly") {
      return this.farmManager.countRooms(player) === condition.count && state.players.filter((candidate) => this.farmManager.countRooms(candidate) === condition.count).length === 1;
    }
    if (condition.type === "builtRoomsWithMaterial") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return this.countRoomsByMaterial(context.actorAfter, condition.material) > this.countRoomsByMaterial(context.actorBefore, condition.material);
    }
    if (condition.type === "renovatedFromTo") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      return context.actorBefore?.farm.roomMaterial === condition.from && context.actorAfter?.farm.roomMaterial === condition.to;
    }
    if (condition.type === "pasturesExactly") {
      return player.farm.pastures.length === condition.count;
    }
    if (condition.type === "actorPaidResources") {
      if (!this.actorMatches(ownerId, context.actorId, condition.actor ?? "self")) return false;
      const before = context.actorBefore;
      const after = context.actorAfter;
      if (!before || !after) return false;
      return Object.entries(condition.resources).every(([resource, amount]) => {
        if (!this.isResourceKey(resource) || !amount) return true;
        return before.resources[resource] - after.resources[resource] >= amount;
      });
    }
    if (condition.type === "fieldComposition") {
      const grainFields = countScoringCropFields(player, "grain");
      const vegetableFields = countScoringCropFields(player, "vegetable");
      const emptyFields = player.farm.cells.filter((cell) => cell.field && !cell.field.crop && cell.field.count === 0).length;
      return (
        grainFields >= (condition.grainFieldsAtLeast ?? 0) &&
        vegetableFields >= (condition.vegetableFieldsAtLeast ?? 0) &&
        emptyFields >= (condition.emptyFieldsAtLeast ?? 0)
      );
    }
    if (condition.type === "roomMaterial") return condition.materials.includes(player.farm.roomMaterial);
    if (condition.type === "roomsAtLeast") return this.farmManager.countRooms(player) >= condition.count;
    if (condition.type === "roomsExactly") return this.farmManager.countRooms(player) === condition.count;
    if (condition.type === "workersExactly") return player.workers.length === condition.count;
    if (condition.type === "animalsAtLeast") return player.animals[condition.animal] >= condition.count;
    if (condition.type === "roundAtLeast") return state.round >= condition.round;
    if (condition.type === "roundAtMost") return state.round <= condition.round;
    if (condition.type === "playedOccupationsAtLeast") return player.occupations.length >= condition.count;
    return false;
  }

  private matchConditionCountThreshold<T extends { min: number; max?: number }>(
    state: GameState,
    ownerId: string,
    countRule: CardConditionCount,
    thresholds: T[],
    context: CardEffectContext,
  ): T | null {
    return this.matchThreshold(this.countConditionMatches(state, ownerId, countRule, context), thresholds);
  }

  private matchThreshold<T extends { min: number; max?: number }>(count: number, thresholds: T[]): T | null {
    return thresholds.reduce<T | null>((best, threshold) => {
      const matches = count >= threshold.min && (threshold.max === undefined || count <= threshold.max);
      return matches && (!best || threshold.min > best.min) ? threshold : best;
    }, null);
  }

  private conditionCountValues(state: GameState, ownerId: string, countRule: CardConditionCount, context: CardEffectContext): number[] {
    if (countRule.type === "harvestedCropFields") {
      return state.players
        .filter((player) => this.actorMatches(ownerId, player.id, countRule.actor ?? "self"))
        .map((player) => context.harvestedByPlayerId?.[player.id]?.[countRule.crop] ?? 0)
        .filter((count) => count > 0);
    }
    return [this.countConditionMatches(state, ownerId, countRule, context)];
  }

  private countConditionMatches(state: GameState, ownerId: string, countRule: CardConditionCount, context: CardEffectContext): number {
    if (countRule.type === "actionSpacesOccupied") {
      return countRule.ids.filter((id) => Boolean(state.actionSpaces.find((space) => space.id === id)?.occupiedBy)).length;
    }
    if (countRule.type === "actionSpacesWithAccumulated") {
      return countRule.ids.filter((id) => (state.actionSpaces.find((space) => space.id === id)?.accumulated[countRule.resource] ?? 0) >= (countRule.atLeast ?? 1)).length;
    }
    if (countRule.type === "playersWithAnimalAtLeast") {
      return state.players.filter((player) => player.animals[countRule.animal] >= countRule.count).length;
    }
    if (countRule.type === "accumulatedTaken") {
      return this.accumulatedTakenAmount(context, countRule.resource);
    }
    if (countRule.type === "harvestedCropFields") {
      return this.conditionCountValues(state, ownerId, countRule, context).reduce((max, count) => Math.max(max, count), 0);
    }
    if (countRule.type === "remainingRounds") {
      return Math.max(0, 14 - state.round);
    }
    return 0;
  }

  private playerForCountSource(state: GameState, ownerId: string, context: CardEffectContext, source: "owner" | "actorBefore" | "actorAfter"): PlayerState | null {
    if (source === "actorBefore") return context.actorBefore ?? null;
    if (source === "actorAfter") return context.actorAfter ?? null;
    return state.players.find((player) => player.id === ownerId) ?? null;
  }

  private playedCardCount(player: PlayerState, kind: "occupation" | "minorImprovement" | "majorImprovement"): number {
    if (kind === "occupation") return player.occupations.length;
    if (kind === "minorImprovement") return player.minorImprovements.length;
    return player.majorImprovements.length;
  }

  private metricValue(player: PlayerState, metric: Extract<CardCondition, { type: "otherPlayerHasMore" }>["metrics"][number]): number {
    if (metric.type === "occupations") return player.occupations.length;
    return player.resources[metric.resource];
  }

  private ownedMajorImprovementCost(player: PlayerState, resources?: ResourceKey[]): number {
    const allowed = resources ? new Set<ResourceKey>(resources) : null;
    return player.majorImprovements.reduce((sum, cardId) => {
      const card = majorImprovements.find((candidate) => candidate.id === cardId);
      if (!card) return sum;
      return sum + Object.entries(card.cost).reduce((costSum, [resource, amount]) => {
        return this.isResourceKey(resource) && (!allowed || allowed.has(resource)) ? costSum + amount : costSum;
      }, 0);
    }, 0);
  }

  private countRoomsByMaterial(player: PlayerState | undefined, material: "wood" | "clay" | "stone"): number {
    return player?.farm.cells.filter((cell) => cell.room && cell.roomMaterial === material).length ?? 0;
  }

  private accumulatedTakenAmount(context: CardEffectContext, resource?: ResourceKey): number {
    if (resource) return context.accumulatedTaken?.[resource] ?? 0;
    return Object.entries(context.accumulatedTaken ?? {}).reduce((sum, [key, amount]) => {
      return this.isResourceKey(key) || this.isAnimalKey(key) ? sum + (amount ?? 0) : sum;
    }, 0);
  }

  private singleTakenResource(context: CardEffectContext): ResourceKey | null {
    const resources = Object.entries(context.accumulatedTaken ?? {})
      .filter((entry): entry is [ResourceKey, number] => this.isResourceKey(entry[0]) && (entry[1] ?? 0) > 0)
      .map(([resource]) => resource);
    return resources.length === 1 ? resources[0] : null;
  }

  private createdPastures(context: CardEffectContext): PlayerState["farm"]["pastures"] {
    const before = context.actorBefore;
    const after = context.actorAfter;
    if (!before || !after) return [];
    const beforeKeys = new Set(before.farm.pastures.map((pasture) => this.pastureKey(pasture.cells)));
    return after.farm.pastures.filter((pasture) => !beforeKeys.has(this.pastureKey(pasture.cells)));
  }

  private pastureKey(cells: Array<{ row: number; col: number }>): string {
    return cells.map((cell) => `${cell.row}:${cell.col}`).sort().join("|");
  }

  private wasUnfencedCell(player: PlayerState | undefined, cell: { row: number; col: number }): boolean {
    const beforeCell = player?.farm.cells.find((candidate) => candidate.row === cell.row && candidate.col === cell.col);
    return Boolean(beforeCell && !beforeCell.pastureId);
  }

  private hasGainedAnimals(before: PlayerState, after: PlayerState, animals: Partial<Record<AnimalKey, number>>): boolean {
    return Object.entries(animals).every(([animal, amount]) => {
      if (!this.isAnimalKey(animal) || !amount || amount <= 0) return true;
      return after.animals[animal] >= before.animals[animal] + amount;
    });
  }

  private actorMatches(ownerId: string, actorId: string, actor: "self" | "any" | "other"): boolean {
    if (actor === "any") return true;
    if (actor === "other") return ownerId !== actorId;
    return ownerId === actorId;
  }

  private actionGroups(actionSpaceId: string | null, selectedEffectTypes: string[]): ActionGroup[] {
    const groups = new Set<ActionGroup>();
    if (!actionSpaceId) return [];
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
    if (["farm-expansion", "fencing", "farm-redevelopment", "fold-builder-action"].includes(actionSpaceId) || selectedEffectTypes.includes("buildFences")) add("fences");
    if (["house-redevelopment", "farm-redevelopment"].includes(actionSpaceId) || selectedEffectTypes.includes("renovate")) add("renovation");
    if (["major-minor-improvement", "six-improvement"].includes(actionSpaceId) || selectedEffectTypes.includes("buyMajorImprovement")) add("majorImprovement");
    if (["major-minor-improvement", "six-improvement", "house-redevelopment", "family-growth-room"].includes(actionSpaceId) || selectedEffectTypes.includes("playMinorImprovement")) add("minorImprovement");
    if (["five-resource-market", "six-building-supplies"].includes(actionSpaceId)) add("resourceMarket");
    if (["five-build-room-traveling"].includes(actionSpaceId)) add("travelingPlayers");
    return [...groups];
  }

  private hasMatchingCardBakeBread(state: GameState, ownerId: string, actorId: string, actionSpaceId: string, selectedEffectTypes: string[]): boolean {
    const owner = state.players.find((player) => player.id === ownerId);
    if (!owner) return false;
    return [...owner.occupations, ...owner.minorImprovements].some((cardId) =>
      this.cardEffects(cardId).some((effect) =>
        effect.type === "bakeBread" &&
        effect.trigger === "afterAction" &&
        (!effect.condition || this.conditionMatches(state, ownerId, effect.condition, {
          actorId,
          actionSpaceId,
          selectedEffectTypes,
          bakeBreadUsed: true,
        })),
      ),
    );
  }

  private applyCostModifiers(player: PlayerState, scope: CostModifierScope, cost: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> {
    const next = { ...cost };
    const modifiers = [...player.occupations, ...player.minorImprovements]
      .flatMap((cardId) => this.cardEffects(cardId))
      .filter((effect): effect is Extract<CardEffect, { type: "costModifier" }> => effect.type === "costModifier" && effect.scope === scope);
    modifiers.forEach((modifier) => {
      if (modifier.fixedRoomCost && scope === "buildRoom") {
        Object.assign(next, modifier.fixedRoomCost);
      }
      if (modifier.resource && modifier.discount) {
        const discountMultiplier = modifier.discountByInitialRooms ? this.countInitialRooms(player) : modifier.discountByRooms ? this.farmManager.countRooms(player) : 1;
        const discount = modifier.discount * discountMultiplier;
        next[modifier.resource] = Math.max(0, (next[modifier.resource] ?? 0) - discount);
      }
      if (modifier.substitute) {
        const from = modifier.substitute.from;
        const to = modifier.substitute.to;
        const ratio = modifier.substitute.ratio ?? 1;
        const required = next[from] ?? 0;
        const available = Math.floor(player.resources[to] / ratio);
        const substituted = Math.min(required, available);
        if (substituted > 0) {
          next[from] = required - substituted;
          next[to] = (next[to] ?? 0) + substituted * ratio;
        }
      }
    });
    return next;
  }

  private isResourceKey(key: string): key is ResourceKey {
    return ["wood", "clay", "reed", "stone", "grain", "vegetable", "food"].includes(key);
  }

  private isAnimalKey(key: string): key is AnimalKey {
    return ["sheep", "boar", "cattle"].includes(key);
  }

  private countInitialRooms(player: PlayerState): number {
    return player.farm.cells.filter((cell) => cell.room && cell.col === 0 && (cell.row === 1 || cell.row === 2)).length;
  }

  private nextPlayerId(state: GameState, playerId: string): string | null {
    const index = state.players.findIndex((player) => player.id === playerId);
    if (index < 0 || state.players.length <= 1) return null;
    return state.players[(index + 1) % state.players.length]?.id ?? null;
  }

  private scheduleWellFood(state: GameState, player: PlayerState, card: MajorImprovementDefinition): PlayerState {
    const effect = card.effects.find((candidate) => candidate.type === "wellFood");
    if (!effect || effect.type !== "wellFood") {
      return player;
    }
    const pendingFood = Array.from({ length: effect.rounds }, (_, index) => ({
      round: state.round + index + 1,
      amount: effect.foodPerRound,
    })).filter((item) => item.round <= 14);
    return {
      ...player,
      pendingFood: [...player.pendingFood, ...pendingFood],
    };
  }

  private updatePlayer(state: GameState, playerId: string, updater: (player: PlayerState) => PlayerState, purchasedCardId: string, returnedCardId?: string): GameState {
    return {
      ...state,
      players: state.players.map((player) => (player.id === playerId ? updater(player) : player)),
      majorImprovements: state.majorImprovements.map((card) => {
        if (card.id === purchasedCardId) return { ...card, purchasedBy: playerId };
        if (returnedCardId && card.id === returnedCardId) return { ...card, purchasedBy: null };
        return card;
      }),
    };
  }

  private updatePlayerOnly(state: GameState, playerId: string, updater: (player: PlayerState) => PlayerState): GameState {
    return {
      ...state,
      players: state.players.map((player) => (player.id === playerId ? updater(player) : player)),
    };
  }

  private shuffle<T>(items: T[]): T[] {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
  }
}
