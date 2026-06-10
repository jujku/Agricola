export type RoomMaterial = "wood" | "clay" | "stone";
export type CropType = "grain" | "vegetable";

export interface FarmCell {
  row: number;
  col: number;
  room: boolean;
  roomMaterial: RoomMaterial | null;
  field: {
    crop: CropType | null;
    count: number;
  } | null;
  pastureId: string | null;
  stable: boolean;
  animal: "sheep" | "boar" | "cattle" | null;
}

export interface FarmState {
  rows: 3;
  cols: 5;
  cells: FarmCell[];
  roomMaterial: RoomMaterial;
  fencesUsed: number;
  pastures: Array<{
    id: string;
    cells: Array<{ row: number; col: number }>;
  }>;
}
