from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/client/assets/sprites/agricola-resources.png"
OUTPUT_DIR = ROOT / "src/client/assets/resource-atlas"
ATLAS_JSON = OUTPUT_DIR / "atlas.json"
ALPHA_THRESHOLD = 1
PADDING = 1
ENABLE_EXTRUDE = True
MIN_COMPONENT_AREA = 1200

RESOURCE_NAMES = [
    "wood",
    "clay",
    "stone",
    "reed",
    "food",
    "grain",
    "vegetable",
    "begging",
    "starting",
    "sheep",
    "boar",
    "cattle",
]


def component_bounds(mask: Image.Image) -> list[tuple[int, int, int, int, int]]:
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    bounds: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] <= ALPHA_THRESHOLD:
                continue

            visited[index] = 1
            queue: deque[tuple[int, int]] = deque([(x, y)])
            min_x = max_x = x
            min_y = max_y = y
            area = 0

            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)

                for next_x in (current_x - 1, current_x, current_x + 1):
                    for next_y in (current_y - 1, current_y, current_y + 1):
                        if next_x < 0 or next_y < 0 or next_x >= width or next_y >= height:
                            continue
                        next_index = next_y * width + next_x
                        if visited[next_index] or pixels[next_x, next_y] <= ALPHA_THRESHOLD:
                            continue
                        visited[next_index] = 1
                        queue.append((next_x, next_y))

            if area >= MIN_COMPONENT_AREA:
                bounds.append((min_x, min_y, max_x, max_y, area))

    return bounds


def add_padding(bounds: tuple[int, int, int, int, int], source_size: tuple[int, int]) -> tuple[int, int, int, int]:
    min_x, min_y, max_x, max_y, _area = bounds
    source_width, source_height = source_size
    return (
        max(0, min_x - PADDING),
        max(0, min_y - PADDING),
        min(source_width - 1, max_x + PADDING),
        min(source_height - 1, max_y + PADDING),
    )


def extrude(crop: Image.Image) -> Image.Image:
    return ImageOps.expand(crop, border=1)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    alpha = source.getchannel("A")
    components = component_bounds(alpha)
    components.sort(key=lambda item: (item[1] // 120, item[0]))

    if len(components) != len(RESOURCE_NAMES):
        raise SystemExit(f"Expected {len(RESOURCE_NAMES)} sprites, found {len(components)} components: {components}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for old_png in OUTPUT_DIR.glob("*.png"):
        old_png.unlink()

    frames: dict[str, dict[str, object]] = {}
    for name, component in zip(RESOURCE_NAMES, components):
        min_x, min_y, max_x, max_y = add_padding(component, source.size)
        crop = source.crop((min_x, min_y, max_x + 1, max_y + 1))
        output_image = extrude(crop) if ENABLE_EXTRUDE else crop
        output_image.save(OUTPUT_DIR / f"{name}.png")

        frame_width = max_x - min_x + 1
        frame_height = max_y - min_y + 1
        frames[name] = {
            "image": f"./{name}.png",
            "sourceSize": {"w": source.width, "h": source.height},
            "frame": {"x": min_x, "y": min_y, "w": frame_width, "h": frame_height},
            "offset": {"x": min_x, "y": min_y},
            "spriteSourceSize": {"x": 0, "y": 0, "w": frame_width, "h": frame_height},
            "trimmed": True,
            "rotated": False,
            "extruded": ENABLE_EXTRUDE,
            "padding": PADDING,
        }

    ATLAS_JSON.write_text(json.dumps({"frames": frames, "meta": {"source": SOURCE.name, "alphaThreshold": ALPHA_THRESHOLD}}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
