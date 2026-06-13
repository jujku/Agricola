import type { ReactElement, SVGProps } from "react";
import { createSpriteIcon } from "./ResourceSpriteIcon";

export type ResourceIconKey =
  | "wood"
  | "clay"
  | "reed"
  | "stone"
  | "food"
  | "grain"
  | "vegetable"
  | "begging"
  | "starting"
  | "sheep"
  | "boar"
  | "cattle"
  | "house"
  | "field"
  | "pasture"
  | "fence"
  | "family"
  | "stable";

export interface IconProps {
  className?: string;
  color?: string;
  size?: number;
}

function Svg({ children, size = 24, ...props }: IconProps & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const WoodIcon = createSpriteIcon("wood");
export const ClayIcon = createSpriteIcon("clay");
export const ReedIcon = createSpriteIcon("reed");
export const StoneIcon = createSpriteIcon("stone");
export const FoodIcon = createSpriteIcon("food");
export const GrainIcon = createSpriteIcon("grain");
export const VegetableIcon = createSpriteIcon("vegetable");
export const BeggingIcon = createSpriteIcon("begging");
export const StartingIcon = createSpriteIcon("starting");
export const SheepIcon = createSpriteIcon("sheep");
export const BoarIcon = createSpriteIcon("boar");
export const CattleIcon = createSpriteIcon("cattle");

export function HouseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="12" width="16" height="10" rx="1" fill="#C8894A" stroke="#5A3714" strokeWidth="2" />
      <path d="m2 13 10-10 10 10Z" fill="#8B5E3C" stroke="#5A3714" strokeWidth="2" strokeLinejoin="round" />
      <rect x="10" y="16" width="4" height="6" rx="1" fill="#5A3714" />
    </Svg>
  );
}

export function FieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="14" rx="2" fill="#8B6030" stroke="#5A3714" strokeWidth="2" />
      <path d="M3 10q9-2 18 0M3 13.5q9-2 18 0M3 17q9-2 18 0" stroke="#5A3714" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </Svg>
  );
}

export function PastureIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="10" width="18" height="12" rx="2" fill="#5A9B3A" stroke="#3A6020" strokeWidth="2" />
      <rect x="4" y="8" width="16" height="2" rx="1" fill="#D4A060" stroke="#5A3714" strokeWidth="1.2" />
      <rect x="4" y="12.5" width="16" height="2" rx="1" fill="#D4A060" stroke="#5A3714" strokeWidth="1.2" />
      <rect x="4" y="8" width="2.5" height="8" rx="1" fill="#C8894A" stroke="#5A3714" strokeWidth="1.5" />
      <rect x="17.5" y="8" width="2.5" height="8" rx="1" fill="#C8894A" stroke="#5A3714" strokeWidth="1.5" />
    </Svg>
  );
}

export function FenceIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="3.5" height="14" rx="1.5" fill="#C8894A" stroke="#5A3714" strokeWidth="2" />
      <rect x="17.5" y="6" width="3.5" height="14" rx="1.5" fill="#C8894A" stroke="#5A3714" strokeWidth="2" />
      <rect x="4" y="8" width="16" height="2.5" rx="1.2" fill="#D4A060" stroke="#5A3714" strokeWidth="1.5" />
      <rect x="4" y="14" width="16" height="2.5" rx="1.2" fill="#D4A060" stroke="#5A3714" strokeWidth="1.5" />
    </Svg>
  );
}

export function FamilyMemberIcon({ color = "#C84040", ...props }: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="4.5" rx="5" ry="1.5" fill={color} stroke="#5A1414" strokeWidth="1.5" />
      <circle cx="12" cy="8" r="3.5" fill="#F0D0A8" stroke="#7A4818" strokeWidth="2" />
      <path d="M8 12c0-1 1-1.5 4-1.5s4 .5 4 1.5l1 7H7Z" fill={color} stroke="#5A1414" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.5 19 8.5 22M14.5 19l1 3" stroke="#5A1414" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function StableIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="13" width="16" height="9" rx="1" fill="#C84030" stroke="#7A1818" strokeWidth="2" />
      <path d="m2 14 10-9 10 9Z" fill="#7A1818" stroke="#5A1010" strokeWidth="2" strokeLinejoin="round" />
      <rect x="9" y="16" width="6" height="6" rx="1" fill="#8B4020" />
      <path d="M12 16v6M9 19h6" stroke="#6A2810" strokeWidth="1" />
    </Svg>
  );
}

export const RESOURCE_ICONS = {
  wood: WoodIcon,
  clay: ClayIcon,
  reed: ReedIcon,
  stone: StoneIcon,
  food: FoodIcon,
  grain: GrainIcon,
  vegetable: VegetableIcon,
  begging: BeggingIcon,
  starting: StartingIcon,
  sheep: SheepIcon,
  boar: BoarIcon,
  cattle: CattleIcon,
  house: HouseIcon,
  field: FieldIcon,
  pasture: PastureIcon,
  fence: FenceIcon,
  family: FamilyMemberIcon,
  stable: StableIcon,
} satisfies Record<ResourceIconKey, (props: IconProps) => ReactElement>;
