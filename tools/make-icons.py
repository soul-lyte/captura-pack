"""Draws the pack's own small icons: the capture ball, the admin codex and the pack icon.

usage: python make-icons.py <pack-dir>

These are original pixel art made for Captura, not taken from any game.
"""
import json
import os
import sys

from PIL import Image

pack = sys.argv[1]
tex = os.path.join(pack, "assets/captura/textures/item")
models = os.path.join(pack, "assets/captura/models/item")
items = os.path.join(pack, "assets/captura/items")
for d in (tex, models, items):
    os.makedirs(d, exist_ok=True)

DARK = (32, 32, 40, 255)
RED = (214, 48, 48, 255)
RED_LIGHT = (240, 98, 98, 255)
RED_SHADE = (160, 30, 36, 255)
WHITE = (244, 244, 248, 255)
WHITE_SHADE = (196, 198, 210, 255)
CLEAR = (0, 0, 0, 0)


def ball():
    img = Image.new("RGBA", (16, 16), CLEAR)
    c = 7.5
    for y in range(16):
        for x in range(16):
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5
            if d > 7.2:
                continue
            if d > 6.2:
                img.putpixel((x, y), DARK)
                continue
            top = y < 7
            band = y in (7, 8)
            if band:
                img.putpixel((x, y), DARK)
            elif top:
                shade = RED_SHADE if (x - c) + (y - c) > 3 else RED
                if (x - c) < -1 and (y - c) < -2 and d > 3.5:
                    shade = RED_LIGHT
                img.putpixel((x, y), shade)
            else:
                shade = WHITE_SHADE if (x - c) + (y - c) > 5 else WHITE
                img.putpixel((x, y), shade)
    for y in range(5, 11):
        for x in range(5, 11):
            ring = x in (5, 10) or y in (5, 10)
            img.putpixel((x, y), DARK if ring else WHITE)
    for x, y in ((8, 8), (9, 8), (8, 9), (9, 9)):
        img.putpixel((x, y), WHITE_SHADE)
    return img


def codex():
    img = Image.new("RGBA", (16, 16), CLEAR)
    cover = (96, 52, 160, 255)
    cover_light = (140, 92, 205, 255)
    page = (238, 232, 214, 255)
    gold = (244, 200, 72, 255)
    for y in range(2, 14):
        for x in range(3, 13):
            edge = x in (3, 12) or y in (2, 13)
            img.putpixel((x, y), DARK if edge else cover)
    for y in range(3, 13):
        img.putpixel((4, y), cover_light)
    for y in range(3, 13):
        img.putpixel((11, y), page)
    for x, y in ((8, 5), (7, 6), (8, 6), (9, 6), (6, 7), (7, 7), (8, 7), (9, 7), (10, 7), (7, 8), (8, 8), (9, 8), (8, 9)):
        img.putpixel((x, y), gold)
    return img


def logo():
    big = ball().resize((112, 112), Image.NEAREST)
    img = Image.new("RGBA", (128, 128), (36, 40, 60, 255))
    img.paste(big, (8, 8), big)
    return img


ball().save(os.path.join(tex, "capture_ball.png"))
codex().save(os.path.join(tex, "codex.png"))
logo().save(os.path.join(pack, "pack.png"))
for name in ("capture_ball", "codex"):
    with open(os.path.join(models, f"{name}.json"), "w") as f:
        json.dump({"parent": "minecraft:item/generated", "textures": {"layer0": f"captura:item/{name}"}}, f)
    with open(os.path.join(items, f"{name}.json"), "w") as f:
        json.dump({"model": {"type": "minecraft:model", "model": f"captura:item/{name}"}}, f)
print("icons written")
