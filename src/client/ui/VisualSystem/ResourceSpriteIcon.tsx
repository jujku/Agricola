import type { CSSProperties, HTMLAttributes } from "react";
import { RESOURCE_ATLAS, RESOURCE_ATLAS_IMAGES, type SpriteResourceIconKey } from "./resourceAtlas";

interface ResourceSpriteIconProps extends HTMLAttributes<HTMLSpanElement> {
  name: SpriteResourceIconKey;
  size?: number;
}

export function ResourceSpriteIcon({ className = "", name, size = 24, style, ...props }: ResourceSpriteIconProps) {
  const sprite = RESOURCE_ATLAS[name];
  const scale = size / Math.max(sprite.frame.w, sprite.frame.h);
  const width = Math.round(sprite.frame.w * scale);
  const height = Math.round(sprite.frame.h * scale);

  const spriteStyle: CSSProperties = {
    width,
    height,
    ...style,
  };

  return (
    <span aria-hidden="true" className={`resource-sprite-icon ${className}`.trim()} data-sprite-icon={name} style={spriteStyle} {...props}>
      <img alt="" draggable={false} src={RESOURCE_ATLAS_IMAGES[name]} />
    </span>
  );
}

export function createSpriteIcon(name: SpriteResourceIconKey) {
  return function SpriteIcon({ size = 24, ...props }: Omit<ResourceSpriteIconProps, "name">) {
    return <ResourceSpriteIcon name={name} size={size} {...props} />;
  };
}
