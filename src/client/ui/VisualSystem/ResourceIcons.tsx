import type { ReactElement, SVGProps } from "react";

export type ResourceIconKey =
  | "wood"
  | "clay"
  | "reed"
  | "stone"
  | "food"
  | "grain"
  | "vegetable"
  | "sheep"
  | "boar"
  | "cattle"
  | "house"
  | "field"
  | "pasture"
  | "fence"
  | "family"
  | "stable";

interface IconProps extends SVGProps<SVGSVGElement> {
  color?: string;
  size?: number;
}

function Svg({ children, size = 24, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function WoodIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" fill="#C8894A" stroke="#5A3714" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" stroke="#5A3714" strokeWidth="1.5" opacity="0.45" />
      <circle cx="12" cy="12" r="3" stroke="#5A3714" strokeWidth="1" opacity="0.35" />
      <circle cx="12" cy="12" r="1.2" fill="#5A3714" opacity="0.6" />
    </Svg>
  );
}

export function ClayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="7" width="18" height="10" rx="2" fill="#C46B35" stroke="#7A3A14" strokeWidth="2" />
      <path d="M3 12h18M10 7v5M16 12v5" stroke="#7A3A14" strokeWidth="1.2" />
      <rect x="4" y="8" width="5" height="3" rx="1" fill="#E08050" opacity="0.5" />
    </Svg>
  );
}

export function ReedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 20 6 8M12 21V6M17 20l1-12" stroke="#4E7A2E" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="5.5" cy="6.5" rx="2" ry="3.5" fill="#6B8F3E" stroke="#3D5A20" strokeWidth="1.5" transform="rotate(-10 5.5 6.5)" />
      <ellipse cx="12" cy="4" rx="2" ry="3.5" fill="#7FAF4A" stroke="#3D5A20" strokeWidth="1.5" />
      <ellipse cx="18.5" cy="6.5" rx="2" ry="3.5" fill="#6B8F3E" stroke="#3D5A20" strokeWidth="1.5" transform="rotate(10 18.5 6.5)" />
    </Svg>
  );
}

export function StoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 15c-1-3 0-8 4-10s9 0 10 4-1 9-5 10-8-1-9-4Z" fill="#9A9A8A" stroke="#5A5A50" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="9" cy="9" rx="2.5" ry="1.8" fill="#C8C8B8" opacity="0.7" transform="rotate(-20 9 9)" />
      <ellipse cx="14" cy="15" rx="2" ry="1.5" fill="#6A6A60" opacity="0.3" />
    </Svg>
  );
}

export function FoodIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 14c0-4 3-8 8-8s8 4 8 8v4c0 1-1 2-2 2H6c-1 0-2-1-2-2Z" fill="#D4A040" stroke="#8B6010" strokeWidth="2" />
      <path d="M7 14c0-4 2-7 5-7s5 3 5 7" fill="#E8BC60" />
      <path d="M9 10c.5-1.5 1.5-2 3-2s2.5.5 3 2" stroke="#8B6010" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

export function GrainIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21V8" stroke="#8B6010" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 14c-2-1-4-2-4-4 2 0 3 2 4 4ZM12 12c2-1 4-2 4-4-2 0-3 2-4 4Z" fill="#6B8F3E" stroke="#3D5A20" strokeWidth="1" />
      <ellipse cx="12" cy="6.5" rx="1.5" ry="2" fill="#D4A940" stroke="#8B6010" strokeWidth="1.5" />
      <ellipse cx="9.5" cy="7.5" rx="1.2" ry="1.8" fill="#D4A940" stroke="#8B6010" strokeWidth="1.2" transform="rotate(-15 9.5 7.5)" />
      <ellipse cx="14.5" cy="7.5" rx="1.2" ry="1.8" fill="#D4A940" stroke="#8B6010" strokeWidth="1.2" transform="rotate(15 14.5 7.5)" />
    </Svg>
  );
}

export function VegetableIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 8h6l-2 12h-2Z" fill="#E07030" stroke="#7A3018" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 8c-1-3-3-5-4-6 1 2 3 4 4 6ZM12 8V1M12 8c1-3 3-5 4-6-1 2-3 4-4 6Z" fill="#4E8C3A" stroke="#2D5A1E" strokeWidth="1.2" />
    </Svg>
  );
}

export function SheepIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="13" r="7" fill="#EDE8D8" stroke="#5A3714" strokeWidth="2" />
      <circle cx="7" cy="11" r="3.5" fill="#F5F0E8" stroke="#5A3714" strokeWidth="1.5" />
      <circle cx="17" cy="11" r="3.5" fill="#F5F0E8" stroke="#5A3714" strokeWidth="1.5" />
      <ellipse cx="12" cy="15" rx="4" ry="3.5" fill="#D4C8A8" stroke="#5A3714" strokeWidth="1.5" />
      <circle cx="10.5" cy="14" r="1" fill="#3A2010" />
      <circle cx="13.5" cy="14" r="1" fill="#3A2010" />
    </Svg>
  );
}

export function BoarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="13" rx="8" ry="7" fill="#B07060" stroke="#5A2818" strokeWidth="2" />
      <ellipse cx="12" cy="17" rx="4.5" ry="3" fill="#C88070" stroke="#5A2818" strokeWidth="1.5" />
      <circle cx="10.5" cy="17.5" r="1" fill="#5A2818" />
      <circle cx="13.5" cy="17.5" r="1" fill="#5A2818" />
      <circle cx="9" cy="11" r="1.3" fill="#1A0808" />
      <circle cx="15" cy="11" r="1.3" fill="#1A0808" />
    </Svg>
  );
}

export function CattleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="9" width="14" height="11" rx="4" fill="#7A5C3A" stroke="#3A2010" strokeWidth="2" />
      <ellipse cx="12" cy="18" rx="4" ry="2.5" fill="#9A7850" stroke="#3A2010" strokeWidth="1.5" />
      <circle cx="9" cy="13" r="1.5" fill="#F0E8D0" />
      <circle cx="15" cy="13" r="1.5" fill="#F0E8D0" />
      <path d="M7 10c-2-2-3-4-1-5 1 1 1 3 2 5M17 10c2-2 3-4 1-5-1 1-1 3-2 5" fill="#C8A040" stroke="#8B6010" strokeWidth="1.5" />
    </Svg>
  );
}

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
