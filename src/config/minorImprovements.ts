import type { Trigger } from "../engine/EventBus";

export interface MinorImprovementDefinition {
  id: string;
  name: string;
  cost: Record<string, number>;
  victoryPoints: number;
  triggers: Trigger[];
  effects: string[];
}

export const minorImprovements: MinorImprovementDefinition[] = [];
