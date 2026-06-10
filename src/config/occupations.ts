import type { Trigger } from "../engine/EventBus";

export interface OccupationDefinition {
  id: string;
  name: string;
  bonusPoints: number;
  triggers: Trigger[];
  effects: string[];
}

export const occupations: OccupationDefinition[] = [];
