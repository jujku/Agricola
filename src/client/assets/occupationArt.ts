import { occupations } from "../../config/occupations";

const imageModules = import.meta.glob("./occupations/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const orderedImages = Object.entries(imageModules)
  .filter(([path]) => /\/\d{2}-.+\.png$/.test(path))
  .map(([path, url]) => [path.split("/").pop() ?? path, url] as const)
  .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN", { numeric: true, sensitivity: "base" }));

if (orderedImages.length !== occupations.length) {
  throw new Error(`职业插画数量不匹配：${orderedImages.length} 张插画，对应 ${occupations.length} 张卡。`);
}

export const occupationArtById = Object.fromEntries(
  occupations.map((card, index) => [card.id, orderedImages[index]?.[1] ?? ""] as const),
);
