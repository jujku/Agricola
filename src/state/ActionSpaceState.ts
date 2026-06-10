export interface ActionSpaceState {
  id: string;
  name: string;
  type: "accumulation" | "instant" | "choice" | "placeholder";
  cost: Record<string, number>;
  gain: Record<string, number>;
  prerequisites: string[];
  rules: string[];
  restrictions: string[];
  occupiedBy: string | null;
  accumulated: Record<string, number>;
  effects: import("../config/baseActions").ActionEffect[];
}
