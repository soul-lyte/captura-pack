"""Draws the Captura menu art and writes the font that places it.

usage: python make-gui.py <pack-dir> <plugin-resources-dir>

Each menu is a chest screen whose title is a string of glyphs from the font captura:gui. One glyph is
the whole background picture, the others are text and HP bar pieces at exact pixel positions. The
plugin reads gui-layout.json (written here) to learn which character is which picture and how wide
each letter is, so the two always agree.

Needs Python 3 with Pillow and the Minecraft 1.21.11 client jar (for the width of each letter in
ascii.png, which the font reuses so no Mojang file is copied into the pack).
"""
import io
import json
import os
import sys
import zipfile

from PIL import Image, ImageDraw

pack_dir, res_dir = sys.argv[1], sys.argv[2]
W = 176
H6 = 222
H4 = 186
TEXT_LEVELS = 128      # text can start at any y from 0 to 127
BAR_STEPS = 40         # the HP bar fill moves in 2 px steps
BAR_W = 80
TRACK_W = 84

# palette
FRAME_OUT = (17, 19, 22, 255)
FRAME_IN = (46, 50, 57, 255)
FRAME_HI = (84, 90, 100, 255)
BAG = (33, 36, 41, 255)
PANEL = (64, 69, 78, 255)
PANEL_HI = (88, 94, 105, 255)
PANEL_LO = (41, 44, 50, 255)
PANEL_LINE = (20, 22, 26, 255)
DARK = (31, 33, 38, 255)
LIGHT = (214, 217, 222, 255)
LIGHT_LO = (178, 182, 189, 255)
RED = (214, 67, 58, 255)
GREEN = (84, 190, 84, 255)
YELLOW = (232, 190, 52, 255)
BLUE = (60, 140, 220, 255)
GREY = (120, 125, 133, 255)

ICONS = {
    "fight": [
        "....#....",
        "#...#...#",
        ".#..#..#.",
        "..#.#.#..",
        "#########",
        "..#.#.#..",
        ".#..#..#.",
        "#...#...#",
        "....#....",
    ],
    "switch": [
        "...#.....",
        "...##....",
        "#########",
        "...##....",
        "...#.....",
        ".....#...",
        "....##...",
        "#########",
        "....##...",
        ".....#...",
    ],
    "catch": [
        "..#####..",
        ".#######.",
        "#########",
        "#########",
        "###...###",
        "##.....##",
        "###...###",
        ".#######.",
        "..#####..",
    ],
    "run": [
        "....##...",
        "....##...",
        "..####...",
        ".#.##....",
        "...###...",
        "..#..#...",
        ".#....#..",
        "#.....#..",
    ],
    "flag": [
        "#........",
        "####.....",
        "######...",
        "#######..",
        "######...",
        "####.....",
        "#........",
        "#........",
        "#........",
    ],
    "back": [
        "...#.....",
        "..##.....",
        ".#######.",
        "..##...#.",
        "...#...#.",
        "......##.",
    ],
    "left": [
        "...#",
        "..##",
        ".###",
        "####",
        ".###",
        "..##",
        "...#",
    ],
    "right": [
        "#...",
        "##..",
        "###.",
        "####",
        "###.",
        "##..",
        "#...",
    ],
    "plus": [
        "...#...",
        "...#...",
        "...#...",
        "#######",
        "...#...",
        "...#...",
        "...#...",
    ],
}


def new(h):
    return Image.new("RGBA", (W, h), (0, 0, 0, 0))


def box(d, x0, y0, x1, y1, fill, outline=None):
    d.rectangle([x0, y0, x1, y1], fill=fill, outline=outline)


def panel(d, x0, y0, x1, y1):
    box(d, x0, y0, x1, y1, PANEL, PANEL_LINE)
    d.line([x0 + 1, y0 + 1, x1 - 1, y0 + 1], fill=PANEL_HI)
    d.line([x0 + 1, y1 - 1, x1 - 1, y1 - 1], fill=PANEL_LO)


def cell(d, x, y):
    """The dark inset behind one slot. x, y is where the item is drawn; the box starts a pixel up and left."""
    x -= 1
    y -= 1
    box(d, x, y, x + 17, y + 17, DARK, PANEL_LINE)
    d.line([x + 1, y + 1, x + 16, y + 1], fill=(22, 24, 28, 255))


def track(d, x, y):
    box(d, x, y, x + TRACK_W - 1, y + 6, (27, 29, 33, 255), (10, 11, 13, 255))


def icon(d, name, x, y, color):
    for r, row in enumerate(ICONS[name]):
        for c, ch in enumerate(row):
            if ch == "#":
                d.point((x + c, y + r), fill=color)


def button(d, x0, y0, x1, y1, stripe, icon_name):
    d.rectangle([x0 + 1, y1 + 1, x1 + 1, y1 + 1], fill=(14, 15, 18, 200))
    box(d, x0, y0, x1, y1, LIGHT, (30, 32, 36, 255))
    d.line([x0 + 1, y1 - 1, x1 - 1, y1 - 1], fill=LIGHT_LO)
    d.line([x0 + 1, y0 + 1, x1 - 1, y0 + 1], fill=(240, 242, 245, 255))
    box(d, x1 - 4, y0 + 1, x1 - 1, y1 - 1, stripe, None)
    d.line([x1 - 5, y0 + 1, x1 - 5, y1 - 1], fill=(30, 32, 36, 255))
    if icon_name:
        h = len(ICONS[icon_name])
        icon(d, icon_name, x1 - 17, y0 + (y1 - y0 + 1 - h) // 2, (52, 56, 63, 255))


def frame(h, rows):
    """Window frame, header band and the player-inventory zone for a chest with `rows` rows."""
    img = new(h)
    d = ImageDraw.Draw(img)
    box(d, 0, 0, W - 1, h - 1, FRAME_IN, FRAME_OUT)
    d.line([1, 1, W - 2, 1], fill=FRAME_HI)
    d.line([1, 1, 1, h - 2], fill=FRAME_HI)
    label = h - 94  # where the vanilla "Inventory" label sits
    box(d, 4, label - 2, W - 5, h - 5, BAG, PANEL_LINE)
    first = 103 + (rows - 4) * 18  # where the player's top inventory row is drawn
    for r in range(3):
        for c in range(9):
            cell(d, 8 + 18 * c, first + 18 * r)
    for c in range(9):
        cell(d, 8 + 18 * c, first + 58)
    return img, d


def rows_panels(d, n, with_track):
    for r in range(n):
        y = 18 + 18 * r
        panel(d, 6, y - 1, 169, y + 16)
        cell(d, 8, y)
        if with_track:
            track(d, 30, y + 9)


def make_codex_grid():
    """45 species cells, then a footer: previous, level down, level label (shiny switch), level up, next."""
    img, d = frame(H6, 6)
    panel(d, 6, 15, 169, 106)
    for r in range(5):
        for c in range(9):
            cell(d, 8 + 18 * c, 18 + 18 * r)
    y = 18 + 18 * 5
    button(d, 7, y, 42, y + 15, GREY, None)
    icon(d, "left", 22, y + 4, (52, 56, 63, 255))
    button(d, 43, y, 60, y + 15, GREY, None)
    d.rectangle([48, y + 7, 54, y + 8], fill=(52, 56, 63, 255))
    panel(d, 61, y, 114, y + 15)
    button(d, 115, y, 132, y + 15, GREY, None)
    d.rectangle([120, y + 7, 126, y + 8], fill=(52, 56, 63, 255))
    d.rectangle([122, y + 5, 124, y + 10], fill=(52, 56, 63, 255))
    button(d, 133, y, 168, y + 15, GREY, None)
    icon(d, "right", 147, y + 4, (52, 56, 63, 255))
    return img


CARD_STEPS = 32         # the card HP bar is 64 px wide


def make_cards(n):
    """Up to six cards, two across and three down; each card is four slots wide and two tall."""
    img, d = frame(H6, 6)
    for k in range(n):
        x0 = 6 if k % 2 == 0 else 96
        y0 = 17 + 36 * (k // 2)
        panel(d, x0, y0, x0 + 73, y0 + 35)
        cell(d, x0 + 2, y0 + 1)
        box(d, x0 + 3, y0 + 28, x0 + 70, y0 + 34, (27, 29, 33, 255), (10, 11, 13, 255))
    return img


def make_list(n, with_track, footer):
    img, d = frame(H6, 6)
    rows_panels(d, n, with_track)
    if footer:
        y = 18 + 18 * 5
        button(d, 7, y, 42, y + 15, GREY, None)
        icon(d, "left", 22, y + 4, (52, 56, 63, 255))
        button(d, 133, y, 168, y + 15, GREY, None)
        icon(d, "right", 147, y + 4, (52, 56, 63, 255))
    return img


def make_battle(trainer):
    img, d = frame(H6, 6)
    # foe panel
    panel(d, 6, 14, 169, 38)
    box(d, 7, 15, 168, 16, RED)
    cell(d, 8, 18)
    track(d, 30, 27)
    # log
    box(d, 6, 40, 169, 67, LIGHT, PANEL_LINE)
    d.line([7, 41, 168, 41], fill=(240, 242, 245, 255))
    d.line([7, 66, 168, 66], fill=LIGHT_LO)
    # own panel
    panel(d, 6, 68, 169, 90)
    box(d, 7, 69, 168, 70, BLUE)
    cell(d, 8, 72)
    track(d, 30, 82)
    button(d, 7, 91, 80, 106, RED, "fight")
    button(d, 97, 91, 170, 106, GREEN, "switch")
    if trainer:
        button(d, 7, 109, 80, 124, GREY, "flag")
    else:
        button(d, 7, 109, 80, 124, YELLOW, "catch")
        button(d, 97, 109, 170, 124, BLUE, "run")
    return img


def make_moves():
    img, d = frame(H6, 6)
    for (x, y) in [(6, 17), (96, 17), (6, 53), (96, 53)]:
        panel(d, x, y, x + 73, y + 35)
    button(d, 7, 109, 80, 124, GREY, "back")
    return img


def make_pc():
    img, d = frame(H6, 6)
    panel(d, 6, 15, 169, 88)
    panel(d, 6, 89, 169, 107)
    box(d, 7, 90, 168, 91, BLUE)
    for r in range(5):
        for c in range(9):
            if r < 4 or c < 6:
                cell(d, 8 + 18 * c, 18 + 18 * r)
    button(d, 7, 109, 42, 124, GREY, None)
    icon(d, "left", 22, 113, (52, 56, 63, 255))
    button(d, 133, 109, 168, 124, GREY, None)
    icon(d, "right", 147, 113, (52, 56, 63, 255))
    return img


def make_crate():
    img, d = frame(H4, 4)
    panel(d, 6, 15, 169, 70)
    button(d, 7, 72, 168, 87, GREEN, None)
    return img


def make_daycare():
    """Three cards, each three slots wide and four rows tall: parent, parent, egg."""
    img, d = frame(H4, 4)
    for x0, x1 in [(6, 59), (61, 113), (115, 169)]:
        panel(d, x0, 15, x1, 88)
    for x in (26, 80, 134):
        cell(d, x, 36)
    return img


def widths():
    jar = os.path.join(os.environ.get("APPDATA", ""), ".minecraft/versions/1.21.11/1.21.11.jar")
    z = zipfile.ZipFile(jar)
    im = Image.open(io.BytesIO(z.read("assets/minecraft/textures/font/ascii.png"))).convert("RGBA")
    out = []
    for code in range(32, 128):
        r, c = divmod(code, 16)
        mx = -1
        for x in range(8):
            for y in range(8):
                if im.getpixel((c * 8 + x, r * 8 + y))[3] > 0:
                    mx = max(mx, x)
        out.append(mx + 1)
    out[0] = 3  # the space: advance 4
    return out


def cp(n):
    return chr(n)


def main():
    gui_dir = os.path.join(pack_dir, "assets/captura/textures/gui")
    os.makedirs(gui_dir, exist_ok=True)
    for f in os.listdir(gui_dir):
        os.remove(os.path.join(gui_dir, f))

    screens = {}
    for n in range(1, 7):
        screens[f"list_track_{n}"] = make_list(n, True, False)
        screens[f"list_plain_{n}"] = make_list(n, False, False)
    for n in range(1, 6):
        screens[f"listf_{n}"] = make_list(n, False, True)
    for n in range(1, 7):
        screens[f"cards_{n}"] = make_cards(n)
    screens["codex_grid"] = make_codex_grid()
    screens["battle_wild"] = make_battle(False)
    screens["battle_trainer"] = make_battle(True)
    screens["moves"] = make_moves()
    screens["pc"] = make_pc()
    screens["crate"] = make_crate()
    screens["daycare"] = make_daycare()

    providers = []
    glyphs = {}
    for i, name in enumerate(sorted(screens)):
        img = screens[name]
        img.save(os.path.join(gui_dir, name + ".png"))
        ch = cp(0xE000 + i)
        glyphs[name] = {"char": ch, "advance": W + 1}
        providers.append({"type": "bitmap", "file": f"captura:gui/{name}.png", "ascent": 13,
                          "height": img.size[1], "chars": [ch]})

    # shifts: +-2^k px
    advances = {}
    for k in range(9):
        advances[cp(0xE100 + k)] = float(2 ** k)
        advances[cp(0xE120 + k)] = float(-(2 ** k))
    advances[cp(0xE140)] = 4.0   # a space in a text run
    providers.append({"type": "space", "advances": advances})

    # HP bar fill, one picture per step, tinted by the text colour
    bar = Image.new("RGBA", (BAR_W, 5 * BAR_STEPS), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    shades = [255, 238, 214, 190, 168]
    for k in range(1, BAR_STEPS + 1):
        y0 = (k - 1) * 5
        for r in range(5):
            bd.line([0, y0 + r, 2 * k - 1, y0 + r], fill=(shades[r], shades[r], shades[r], 255))
    bar.save(os.path.join(gui_dir, "bar.png"))
    small = Image.new("RGBA", (2 * CARD_STEPS, 5 * CARD_STEPS), (0, 0, 0, 0))
    sd = ImageDraw.Draw(small)
    for k in range(1, CARD_STEPS + 1):
        y0 = (k - 1) * 5
        for r in range(5):
            sd.line([0, y0 + r, 2 * k - 1, y0 + r], fill=(shades[r], shades[r], shades[r], 255))
    small.save(os.path.join(gui_dir, "bar_card.png"))
    card_base = 0xF9000

    # text: ascii.png letters at every y, via private-use characters
    text_base = 0xF0000
    bar_base = 0xF8000
    # A glyph's ascent may not exceed its height, so text (8 high) starts no higher than y=5 and the
    # bar fill (5 high) no higher than y=8.
    for level in range(TEXT_LEVELS):
        rows = []
        for r in range(16):
            if 2 <= r <= 7:
                rows.append("".join(cp(text_base + level * 128 + r * 16 + c) if not (r == 2 and c == 0) else "\u0000"
                                    for c in range(16)))
            else:
                rows.append("\u0000" * 16)
        if level >= 5:
            providers.append({"type": "bitmap", "file": "minecraft:font/ascii.png", "ascent": 13 - level,
                              "height": 8, "chars": rows})
        if level >= 8:
            providers.append({"type": "bitmap", "file": "captura:gui/bar.png", "ascent": 13 - level,
                              "height": 5, "chars": [cp(bar_base + level * 64 + k) for k in range(1, BAR_STEPS + 1)]})
            providers.append({"type": "bitmap", "file": "captura:gui/bar_card.png", "ascent": 13 - level,
                              "height": 5, "chars": [cp(card_base + level * 64 + k) for k in range(1, CARD_STEPS + 1)]})

    font_dir = os.path.join(pack_dir, "assets/captura/font")
    os.makedirs(font_dir, exist_ok=True)
    with open(os.path.join(font_dir, "gui.json"), "w") as fh:
        json.dump({"providers": providers}, fh, separators=(",", ":"))

    # Hover square: the user chose a faint outline in every inventory instead of the grey fill.
    hl_dir = os.path.join(pack_dir, "assets/minecraft/textures/gui/sprites/container")
    os.makedirs(hl_dir, exist_ok=True)
    Image.new("RGBA", (24, 24), (0, 0, 0, 0)).save(os.path.join(hl_dir, "slot_highlight_back.png"))
    front = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    ImageDraw.Draw(front).rectangle([4, 4, 19, 19], outline=(255, 255, 255, 120))
    front.save(os.path.join(hl_dir, "slot_highlight_front.png"))

    # A see-through square shown in place of the invisible click areas when gui.debug-zones is on.
    dbg_tex = os.path.join(pack_dir, "assets/captura/textures/item/gui")
    os.makedirs(dbg_tex, exist_ok=True)
    Image.new("RGBA", (16, 16), (255, 40, 40, 110)).save(os.path.join(dbg_tex, "zone_debug.png"))
    os.makedirs(os.path.join(pack_dir, "assets/captura/models/item/gui"), exist_ok=True)
    with open(os.path.join(pack_dir, "assets/captura/models/item/gui/zone_debug.json"), "w") as fh:
        json.dump({"parent": "minecraft:item/generated", "textures": {"layer0": "captura:item/gui/zone_debug"}}, fh)

    # Hotbar icons for battles in the world: buttons and one gem per element.
    icon_dir = os.path.join(pack_dir, "assets/captura/textures/item/gui")
    model_dir = os.path.join(pack_dir, "assets/captura/models/item/gui")
    item_dir = os.path.join(pack_dir, "assets/captura/items/gui")
    for dpath in (icon_dir, model_dir, item_dir):
        os.makedirs(dpath, exist_ok=True)

    def save_icon(name, img):
        img.save(os.path.join(icon_dir, name + ".png"))
        with open(os.path.join(model_dir, name + ".json"), "w") as fh:
            json.dump({"parent": "minecraft:item/generated", "textures": {"layer0": "captura:item/gui/" + name}}, fh)
        with open(os.path.join(item_dir, name + ".json"), "w") as fh:
            json.dump({"model": {"type": "minecraft:model", "model": "captura:item/gui/" + name}}, fh)

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import icons
    for name, img in icons.all_icons().items():
        save_icon(name, img)
    item_tex = os.path.join(pack_dir, "assets/captura/textures/item")
    icons.codex_book().save(os.path.join(item_tex, "codex.png"))
    icons.capture_ball().save(os.path.join(item_tex, "capture_ball.png"))

    items_dir = os.path.join(pack_dir, "assets/captura/items")
    with open(os.path.join(items_dir, "blank.json"), "w") as fh:
        json.dump({"model": {"type": "minecraft:empty"}}, fh)
    with open(os.path.join(items_dir, "zone_debug.json"), "w") as fh:
        json.dump({"model": {"type": "minecraft:model", "model": "captura:item/gui/zone_debug"}}, fh)

    layout = {
        "frameWidth": W,
        "backgrounds": glyphs,
        "textBase": text_base,
        "barBase": bar_base,
        "barSteps": BAR_STEPS,
        "cardBarBase": card_base,
        "cardBarSteps": CARD_STEPS,
        "barWidth": BAR_W,
        "shiftBase": 0xE100,
        "spaceChar": 0xE140,
        "widths": widths(),
    }
    with open(os.path.join(res_dir, "gui-layout.json"), "w") as fh:
        json.dump(layout, fh, separators=(",", ":"))
    print("wrote", len(screens), "screens,", len(providers), "providers")


main()
