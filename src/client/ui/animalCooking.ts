import { majorImprovements, type MajorImprovementDefinition } from "../../config/majorImprovements";
import type { FarmAnimalType } from "../../state/FarmState";
import type { PlayerState } from "../../state/PlayerState";

export type AnimalCookOption = {
  id: string;
  name: string;
  foodPerAnimal: number;
};

export function getAnimalCookOptions(player: PlayerState | null, animal: FarmAnimalType): AnimalCookOption[] {
  return (player?.majorImprovements ?? []).flatMap((cardId) => {
    const card = majorImprovements.find((candidate) => candidate.id === cardId);
    const foodPerAnimal = card ? cookValue(card, animal) : 0;
    return card && foodPerAnimal > 0 ? [{ id: card.id, name: card.name, foodPerAnimal }] : [];
  });
}

export function cookValue(card: MajorImprovementDefinition, animal: FarmAnimalType): number {
  const effect = card.effects.find((candidate) => candidate.type === "cook" && candidate.from === animal);
  return effect?.type === "cook" ? effect.toFood : 0;
}
