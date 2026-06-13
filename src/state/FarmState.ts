export type RoomMaterial = "wood" | "clay" | "stone";
export type CropType = "grain" | "vegetable";
export type FarmAnimalType = "sheep" | "boar" | "cattle";
export type FenceEdgeSide = "top" | "right" | "bottom" | "left";
export type FenceSegmentOrientation = "horizontal" | "vertical";

export interface FenceEdge {
  row: number;
  col: number;
  edge: FenceEdgeSide;
}

export interface FenceSegment {
  orientation: FenceSegmentOrientation;
  row: number;
  col: number;
}

export interface AnimalGroup {
  animal: FarmAnimalType | null;
  count: number;
}

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
  animal: FarmAnimalType | null;
}

export interface FarmState {
  rows: 3;
  cols: 5;
  cells: FarmCell[];
  roomMaterial: RoomMaterial;
  fencesUsed: number;
  fences: FenceEdge[];
  fenceSegments: FenceSegment[];
  pastures: Array<{
    id: string;
    cells: Array<{ row: number; col: number }>;
    fenceEdges: FenceEdge[];
    animalType: FarmAnimalType | null;
    animalCount: number;
    capacity: number;
  }>;
  animalHousing: {
    house: AnimalGroup;
    stables: Array<{ row: number; col: number; animal: FarmAnimalType | null; count: number }>;
    cells: Array<{ row: number; col: number; animal: FarmAnimalType | null; count: number }>;
  };
}
