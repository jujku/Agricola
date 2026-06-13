import atlas from "../../assets/resource-atlas/atlas.json";
import beggingUrl from "../../assets/resource-atlas/begging.png";
import boarUrl from "../../assets/resource-atlas/boar.png";
import cattleUrl from "../../assets/resource-atlas/cattle.png";
import clayUrl from "../../assets/resource-atlas/clay.png";
import foodUrl from "../../assets/resource-atlas/food.png";
import grainUrl from "../../assets/resource-atlas/grain.png";
import reedUrl from "../../assets/resource-atlas/reed.png";
import sheepUrl from "../../assets/resource-atlas/sheep.png";
import startingUrl from "../../assets/resource-atlas/starting.png";
import stoneUrl from "../../assets/resource-atlas/stone.png";
import vegetableUrl from "../../assets/resource-atlas/vegetable.png";
import woodUrl from "../../assets/resource-atlas/wood.png";

export type SpriteResourceIconKey =
  | "wood"
  | "clay"
  | "stone"
  | "reed"
  | "food"
  | "grain"
  | "vegetable"
  | "begging"
  | "starting"
  | "sheep"
  | "boar"
  | "cattle";

export interface ResourceAtlasFrame {
  image: string;
  sourceSize: { w: number; h: number };
  frame: { x: number; y: number; w: number; h: number };
  offset: { x: number; y: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  trimmed: boolean;
  rotated: boolean;
  extruded: boolean;
  padding: number;
}

const imageUrls = {
  wood: woodUrl,
  clay: clayUrl,
  stone: stoneUrl,
  reed: reedUrl,
  food: foodUrl,
  grain: grainUrl,
  vegetable: vegetableUrl,
  begging: beggingUrl,
  starting: startingUrl,
  sheep: sheepUrl,
  boar: boarUrl,
  cattle: cattleUrl,
} satisfies Record<SpriteResourceIconKey, string>;

export const RESOURCE_ATLAS = atlas.frames as Record<SpriteResourceIconKey, ResourceAtlasFrame>;
export const RESOURCE_ATLAS_IMAGES = imageUrls;
