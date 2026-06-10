export type Trigger =
  | "ON_COOK"
  | "ON_BAKE_BREAD"
  | "ON_BUILD"
  | "ON_HARVEST"
  | "ON_GAME_END"
  | "ON_ROUND_START";

export interface EffectContext {
  gameId: string;
  playerId?: string;
}

export type CardEffect = (context: EffectContext) => void;

export class EventBus {
  private listeners = new Map<Trigger, CardEffect[]>();

  register(trigger: Trigger, effect: CardEffect): void {
    const effects = this.listeners.get(trigger) ?? [];
    this.listeners.set(trigger, [...effects, effect]);
  }

  dispatch(trigger: Trigger, context: EffectContext): void {
    const effects = this.listeners.get(trigger) ?? [];
    effects.forEach((effect) => effect(context));
  }
}
