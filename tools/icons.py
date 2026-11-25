"""Battle hotbar icons, drawn large and scaled down so edges stay smooth.

Each icon is a round badge (dark rim, coloured face with a soft top light) with a white symbol and
a faint shadow under the symbol. Shapes are described on a 256 x 256 canvas and reduced to 32 x 32.
"""
import math

from PIL import Image, ImageDraw, ImageFilter

BIG = 256
OUT = 32

TYPE_COLORS = {
    "normal": (168, 167, 122), "fire": (238, 129, 48), "water": (99, 144, 240), "grass": (122, 199, 76),
    "electric": (247, 208, 44), "ice": (110, 206, 210), "fighting": (194, 46, 40), "poison": (163, 62, 161),
    "ground": (220, 180, 90), "flying": (169, 143, 243), "psychic": (249, 85, 135), "bug": (166, 185, 26),
    "rock": (182, 161, 54), "ghost": (115, 87, 151), "dragon": (111, 53, 252), "dark": (112, 87, 70),
    "steel": (183, 183, 206), "fairy": (214, 133, 173),
}


def shade(rgb, k):
    return tuple(max(0, min(255, int(c * k))) for c in rgb)


def badge(rgb):
    """The round button: dark rim, face with a vertical light-to-dark blend and a gloss band."""
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([6, 10, 250, 254], fill=(0, 0, 0, 90))  # drop shadow
    d.ellipse([4, 4, 248, 248], fill=(22, 24, 30, 255))  # rim
    face = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    fd = ImageDraw.Draw(face)
    top, bottom = shade(rgb, 1.25), shade(rgb, 0.72)
    for y in range(BIG):
        t = y / BIG
        col = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        fd.line([0, y, BIG, y], fill=col + (255,))
    mask = Image.new("L", (BIG, BIG), 0)
    ImageDraw.Draw(mask).ellipse([20, 20, 232, 232], fill=255)
    img.paste(face, (0, 0), mask)
    gloss = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse([44, 30, 212, 120], fill=(255, 255, 255, 70))
    gmask = Image.new("L", (BIG, BIG), 0)
    ImageDraw.Draw(gmask).ellipse([20, 20, 232, 232], fill=255)
    img.paste(gloss, (0, 0), Image.composite(gloss.split()[3], Image.new("L", (BIG, BIG), 0), gmask))
    d.ellipse([20, 20, 232, 232], outline=shade(rgb, 0.5) + (255,), width=6)
    return img


def symbol_layer():
    return Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))


def finish(base, sym, color=(255, 255, 255, 255)):
    """Puts a white symbol (drawn in any opaque colour on `sym`) on the badge with a soft shadow."""
    alpha = sym.split()[3]
    shadow = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    shadow.putalpha(alpha.point(lambda a: int(a * 0.55)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(5))
    base.alpha_composite(shadow, (0, 8))
    white = Image.new("RGBA", (BIG, BIG), color)
    white.putalpha(alpha)
    base.alpha_composite(white)
    return base.resize((OUT, OUT), Image.LANCZOS)


def poly(d, pts, **kw):
    d.polygon([(x, y) for x, y in pts], **kw)


def rot(points, cx, cy, deg):
    a = math.radians(deg)
    return [(cx + (x - cx) * math.cos(a) - (y - cy) * math.sin(a), cy + (x - cx) * math.sin(a) + (y - cy) * math.cos(a))
            for x, y in points]


# ---- symbols ----

def sword(d, angle):
    blade = [(128, 22), (144, 46), (142, 150), (114, 150), (112, 46)]
    guard = [(88, 148), (168, 148), (168, 168), (88, 168)]
    grip = [(118, 168), (138, 168), (138, 206), (118, 206)]
    pommel = [(108, 204), (148, 204), (148, 224), (108, 224)]
    for part in (blade, guard, grip, pommel):
        poly(d, rot(part, 128, 128, angle), fill=(255, 255, 255, 255))


def sym_fight():
    s = symbol_layer()
    d = ImageDraw.Draw(s)
    sword(d, 40)
    sword(d, -40)
    return s


def arrow_arc(d, cx, cy, r, start, end, width, head):
    d.arc([cx - r, cy - r, cx + r, cy + r], start, end, fill=(255, 255, 255, 255), width=width)
    a = math.radians(end)
    tip = (cx + r * math.cos(a), cy + r * math.sin(a))
    tang = (-math.sin(a), math.cos(a))
    norm = (math.cos(a), math.sin(a))
    p1 = (tip[0] + tang[0] * head, tip[1] + tang[1] * head)
    p2 = (tip[0] - norm[0] * head * 0.8 - tang[0] * head * 0.2, tip[1] - norm[1] * head * 0.8 - tang[1] * head * 0.2)
    p3 = (tip[0] + norm[0] * head * 0.8 - tang[0] * head * 0.2, tip[1] + norm[1] * head * 0.8 - tang[1] * head * 0.2)
    d.polygon([p1, p2, p3], fill=(255, 255, 255, 255))


def sym_switch():
    s = symbol_layer()
    d = ImageDraw.Draw(s)
    arrow_arc(d, 128, 128, 68, 200, 330, 22, 34)
    arrow_arc(d, 128, 128, 68, 20, 150, 22, 34)
    return s


def sym_run():
    s = symbol_layer()
    d = ImageDraw.Draw(s)
    w = (255, 255, 255, 255)
    d.ellipse([132, 44, 168, 80], fill=w)  # head
    d.line([(140, 92), (118, 150)], fill=w, width=26)  # body
    d.line([(118, 150), (150, 178), (138, 214)], fill=w, width=22, joint="curve")  # front leg
    d.line([(118, 150), (94, 176), (64, 176)], fill=w, width=22, joint="curve")  # back leg
    d.line([(136, 102), (170, 124), (190, 108)], fill=w, width=18, joint="curve")  # front arm
    d.line([(134, 104), (106, 112), (88, 138)], fill=w, width=18, joint="curve")  # back arm
    for y in (96, 124, 152):
        d.line([(46, y), (76, y)], fill=(255, 255, 255, 170), width=8)
    return s


def sym_back():
    s = symbol_layer()
    d = ImageDraw.Draw(s)
    d.arc([70, 70, 190, 190], 270, 90, fill=(255, 255, 255, 255), width=24)
    d.line([(130, 70), (100, 70)], fill=(255, 255, 255, 255), width=24)
    d.line([(130, 190), (90, 190)], fill=(255, 255, 255, 255), width=24)
    d.polygon([(52, 70), (104, 30), (104, 110)], fill=(255, 255, 255, 255))
    return s


def sym_flag():
    s = symbol_layer()
    d = ImageDraw.Draw(s)
    d.rectangle([76, 46, 92, 212], fill=(255, 255, 255, 255))
    d.polygon([(92, 50), (190, 70), (150, 100), (190, 130), (92, 140)], fill=(255, 255, 255, 255))
    return s


def sym_wait():
    s = symbol_layer()
    d = ImageDraw.Draw(s)
    w = (255, 255, 255, 255)
    d.rectangle([76, 48, 180, 62], fill=w)
    d.rectangle([76, 194, 180, 208], fill=w)
    d.polygon([(88, 62), (168, 62), (134, 128), (168, 194), (88, 194), (122, 128)], fill=w)
    d.polygon([(104, 80), (152, 80), (128, 120)], fill=(0, 0, 0, 0))
    return s


def sym_ball():
    """A capture ball drawn in colour (red top, white bottom, dark band and button)."""
    s = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(s)
    d.ellipse([58, 58, 198, 198], fill=(25, 25, 30, 255))
    d.pieslice([68, 68, 188, 188], 180, 360, fill=(226, 52, 48, 255))
    d.pieslice([68, 68, 188, 188], 0, 180, fill=(245, 245, 245, 255))
    d.rectangle([68, 120, 188, 136], fill=(25, 25, 30, 255))
    d.ellipse([106, 106, 150, 150], fill=(25, 25, 30, 255))
    d.ellipse([116, 116, 140, 140], fill=(245, 245, 245, 255))
    d.ellipse([84, 80, 112, 100], fill=(255, 255, 255, 110))
    return s


def sym_type(name):
    s = symbol_layer()
    d = ImageDraw.Draw(s)
    w = (255, 255, 255, 255)
    if name == "normal":
        d.ellipse([78, 78, 178, 178], outline=w, width=22)
    elif name == "fire":
        d.polygon([(128, 40), (176, 110), (184, 156), (160, 200), (128, 214), (96, 200), (72, 156), (84, 112), (104, 140)], fill=w)
        d.polygon([(128, 130), (150, 166), (144, 192), (128, 200), (112, 192), (106, 168)], fill=(0, 0, 0, 0))
    elif name == "water":
        d.polygon([(128, 40), (170, 120), (90, 120)], fill=w)
        d.ellipse([84, 100, 172, 210], fill=w)
        d.ellipse([104, 140, 124, 172], fill=(0, 0, 0, 0))
    elif name == "grass":
        leaf = symbol_layer()
        ld = ImageDraw.Draw(leaf)
        ld.ellipse([84, 36, 172, 220], fill=w)
        ld.polygon([(128, 18), (150, 60), (106, 60)], fill=w)
        ld.line([(128, 50), (128, 214)], fill=(0, 0, 0, 0), width=10)
        for y in (100, 140, 180):
            ld.line([(128, y), (154, y - 26)], fill=(0, 0, 0, 0), width=7)
            ld.line([(128, y), (102, y - 26)], fill=(0, 0, 0, 0), width=7)
        s = leaf.rotate(-35, resample=Image.BICUBIC, center=(128, 128))
        return s
    elif name == "electric":
        d.polygon([(146, 36), (80, 138), (122, 138), (104, 220), (178, 108), (134, 108), (160, 36)], fill=w)
    elif name == "ice":
        for k in range(3):
            pts = rot([(128, 46), (128, 210)], 128, 128, k * 60)
            d.line(pts, fill=w, width=18)
            for end in (0, 1):
                tip = pts[end]
                for side in (-1, 1):
                    branch = rot([tip, (tip[0], tip[1])], 128, 128, 0)
                    dx, dy = 128 - tip[0], 128 - tip[1]
                    ln = math.hypot(dx, dy) or 1
                    bx, by = tip[0] + dx / ln * 34, tip[1] + dy / ln * 34
                    px, py = -dy / ln * 24 * side, dx / ln * 24 * side
                    d.line([(bx, by), (bx + px - dx / ln * 10, by + py - dy / ln * 10)], fill=w, width=12)
    elif name == "fighting":
        d.rounded_rectangle([74, 82, 182, 186], radius=26, fill=w)
        for x in (92, 120, 148):
            d.line([(x, 92), (x, 130)], fill=(0, 0, 0, 0), width=6)
        d.rounded_rectangle([58, 120, 104, 160], radius=18, fill=w)
        d.rectangle([92, 186, 166, 212], fill=w)
    elif name == "poison":
        d.ellipse([60, 110, 170, 214], fill=w)
        d.ellipse([140, 64, 196, 120], fill=w)
        d.ellipse([92, 40, 132, 80], fill=w)
    elif name == "ground":
        d.polygon([(40, 200), (104, 92), (150, 160), (176, 120), (216, 200)], fill=w)
        d.line([(60, 214), (196, 214)], fill=w, width=12)
    elif name == "flying":
        for i, (y, l) in enumerate([(76, 140), (112, 120), (148, 96)]):
            d.rounded_rectangle([200 - l, y, 206, y + 30], radius=15, fill=w)
        d.ellipse([46, 60, 110, 200], fill=w)
    elif name == "psychic":
        d.ellipse([46, 86, 210, 170], fill=w)
        d.ellipse([98, 98, 158, 158], fill=(0, 0, 0, 0))
        d.ellipse([114, 114, 142, 142], fill=w)
    elif name == "bug":
        d.ellipse([74, 70, 182, 206], fill=w)
        d.line([(128, 76), (128, 206)], fill=(0, 0, 0, 0), width=10)
        d.ellipse([100, 40, 156, 84], fill=w)
        d.line([(110, 46), (88, 22)], fill=w, width=10)
        d.line([(146, 46), (168, 22)], fill=w, width=10)
    elif name == "rock":
        d.polygon([(60, 190), (78, 104), (130, 56), (192, 96), (204, 180), (150, 210)], fill=w)
        d.line([(130, 56), (124, 140), (60, 190)], fill=(0, 0, 0, 0), width=8)
        d.line([(124, 140), (204, 180)], fill=(0, 0, 0, 0), width=8)
    elif name == "ghost":
        d.ellipse([66, 40, 190, 164], fill=w)
        d.rectangle([66, 100, 190, 196], fill=w)
        for x in (66, 108, 150):
            d.polygon([(x, 196), (x + 21, 224), (x + 42, 196)], fill=w)
        d.ellipse([94, 86, 120, 120], fill=(0, 0, 0, 0))
        d.ellipse([136, 86, 162, 120], fill=(0, 0, 0, 0))
    elif name == "dragon":
        for dx in (-46, 0, 46):
            d.polygon([(128 + dx - 20, 60), (128 + dx + 20, 60), (128 + dx + 4, 212), (128 + dx - 8, 212)], fill=w)
        d.rounded_rectangle([66, 44, 190, 84], radius=16, fill=w)
    elif name == "dark":
        d.ellipse([52, 44, 204, 196], fill=w)
        d.ellipse([92, 22, 232, 162], fill=(0, 0, 0, 0))
    elif name == "steel":
        pts = [(128 + 78 * math.cos(math.radians(60 * k + 30)), 128 + 78 * math.sin(math.radians(60 * k + 30))) for k in range(6)]
        d.polygon(pts, fill=w)
        d.ellipse([96, 96, 160, 160], fill=(0, 0, 0, 0))
    elif name == "fairy":
        pts = []
        for k in range(8):
            r = 90 if k % 2 == 0 else 30
            a = math.radians(45 * k - 90)
            pts.append((128 + r * math.cos(a), 128 + r * math.sin(a)))
        d.polygon(pts, fill=w)
    return s


def clear_holes(sym):
    """Symbols mark holes with transparent paint; draw calls above already wrote alpha 0."""
    return sym


def all_icons():
    out = {
        "fight": finish(badge((214, 58, 52)), sym_fight()),
        "switch": finish(badge((66, 176, 84)), sym_switch()),
        "run": finish(badge((58, 132, 222)), sym_run()),
        "back": finish(badge((112, 118, 128)), sym_back()),
        "flag": finish(badge((112, 118, 128)), sym_flag()),
        "wait": finish(badge((70, 74, 84)), sym_wait()),
    }
    catch = badge((236, 186, 48))
    ball = sym_ball()
    shadow = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    shadow.putalpha(ball.split()[3].point(lambda a: int(a * 0.5)))
    catch.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(5)), (0, 8))
    catch.alpha_composite(ball)
    out["catch"] = catch.resize((OUT, OUT), Image.LANCZOS)
    for name, rgb in TYPE_COLORS.items():
        out["type_" + name] = finish(badge(rgb), sym_type(name))
    return out


def codex_book():
    """The admin codex: a red book with a gold clasp and a ball emblem."""
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([44, 30, 222, 236], radius=18, fill=(0, 0, 0, 80))
    d.rounded_rectangle([60, 36, 224, 226], radius=14, fill=(236, 230, 214, 255))  # pages
    for y in range(52, 214, 14):
        d.line([(70, y), (218, y)], fill=(200, 192, 172, 255), width=3)
    d.rounded_rectangle([34, 24, 206, 218], radius=16, fill=(30, 18, 22, 255))  # cover rim
    cover = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cover)
    top, bottom = (214, 64, 60), (138, 28, 34)
    for y in range(BIG):
        t = y / BIG
        cd.line([0, y, BIG, y], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,))
    mask = Image.new("L", (BIG, BIG), 0)
    ImageDraw.Draw(mask).rounded_rectangle([42, 32, 198, 210], radius=12, fill=255)
    img.paste(cover, (0, 0), mask)
    d.rectangle([42, 32, 64, 210], fill=(110, 22, 28, 255))  # spine
    d.rounded_rectangle([186, 104, 214, 140], radius=6, fill=(236, 190, 70, 255))  # clasp
    ball = sym_ball().resize((120, 120), Image.LANCZOS)
    img.alpha_composite(ball, (72, 62))
    img.alpha_composite(Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0)))
    return img.resize((OUT, OUT), Image.LANCZOS)


def capture_ball():
    ball = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    big = sym_ball().resize((300, 300), Image.LANCZOS)
    ball.alpha_composite(big.crop((22, 22, 278, 278)))
    return ball.resize((OUT, OUT), Image.LANCZOS)
