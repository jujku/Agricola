import { minorImprovements } from "../../config/minorImprovements";

const imageModules = import.meta.glob("./minor-improvements/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const orderedImages = Object.entries(imageModules)
  .map(([path, url]) => [path.split("/").pop() ?? path, url] as const)
  .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN", { numeric: true, sensitivity: "base" }));

if (orderedImages.length !== minorImprovements.length) {
  throw new Error(`小设施插画数量不匹配：${orderedImages.length} 张插画，对应 ${minorImprovements.length} 张卡。`);
}

export const minorImprovementArtById = Object.fromEntries(
  minorImprovements.map((card, index) => [card.id, orderedImages[index]?.[1] ?? ""] as const),
);
