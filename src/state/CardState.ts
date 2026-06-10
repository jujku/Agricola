export interface CardState {
  id: string;
  name: string;
  type: "round" | "majorImprovement" | "occupation" | "minorImprovement";
  victoryPoints?: number;
  purchasedBy?: string | null;
}
