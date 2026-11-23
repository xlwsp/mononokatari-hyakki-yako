#!/usr/bin/env python3
"""images/ の素材から背景を取り除き、ゲーム用スプライトを assets/ に書き出す。
使い方:  python3 tools/prepare_assets.py   (Pillow が必要)
元画像は変更しない。素材を差し替えたら再実行すればOK。
"""
import os
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'images')
OUT = os.path.join(ROOT, 'assets')
os.makedirs(OUT, exist_ok=True)

# マップ小物: (元ファイル, 出力名, 出力の高さ)
PROPS = [
    ('ki01.png', 'tree1', 320),
    ('ki02.png', 'tree2', 320),
    ('ki03.png', 'tree3', 320),
    ('isi01.png', 'rock', 200),
    ('kusa01.png', 'bush', 170),
    ('hana01png.png', 'flower1', 130),
    ('hana02.png', 'flower2', 130),
]
BG = (30, 30, 32)


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def cut_dark_bg(im):
    """暗いグレーの背景（と落ち影）を透明にする。"""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            # 彩度があれば物体、無彩色で暗ければ背景
            a = max(smooth(48, 78, mx), smooth(14, 30, mx - mn) * smooth(30, 55, mx))
            if a <= 0:
                px[x, y] = (0, 0, 0, 0)
            elif a < 1:
                # 背景色が混ざった縁を補正
                c = [int(max(0, min(255, (v - bg * (1 - a)) / a))) for v, bg in zip((r, g, b), BG)]
                px[x, y] = (c[0], c[1], c[2], int(a * 255))
    return im


def cut_white_bg(im):
    """外周からつながる白背景だけを透明化（シャツの白は残す）。"""
    px = im.load()
    w, h = im.size
    seen = bytearray(w * h)

    def is_bg(x, y):
        r, g, b, _ = px[x, y]
        return min(r, g, b) > 232 and max(r, g, b) - min(r, g, b) < 18

    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i] or not is_bg(x, y):
            continue
        seen[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    for y in range(h):
        for x in range(w):
            if not seen[y * w + x]:
                r, g, b, _ = px[x, y]
                # 髪の隙間などに閉じ込められた真っ白な背景も抜く
                if min(r, g, b) > 243 and max(r, g, b) - min(r, g, b) < 10:
                    seen[y * w + x] = 1
            if seen[y * w + x]:
                px[x, y] = (255, 255, 255, 0)
    # 縁のにじみ：背景に接する明るい画素を半透明に
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if seen[y * w + x]:
                continue
            if seen[y * w + x - 1] or seen[y * w + x + 1] or seen[(y - 1) * w + x] or seen[(y + 1) * w + x]:
                r, g, b, _ = px[x, y]
                lum = (r + g + b) / 3
                a = 1 - smooth(150, 245, lum)
                a = max(a, 0.35)
                px[x, y] = (r, g, b, int(255 * a))
    return im, seen


def components(seen, w, h, min_px=4000):
    """非背景ピクセルの連結成分のバウンディングボックス一覧。"""
    lab = bytearray(w * h)
    boxes = []
    for sy in range(0, h, 2):
        for sx in range(0, w, 2):
            i = sy * w + sx
            if seen[i] or lab[i]:
                continue
            q = deque([(sx, sy)]); lab[i] = 1
            x0 = x1 = sx; y0 = y1 = sy; n = 0
            while q:
                x, y = q.popleft(); n += 1
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and not lab[j]:
                            lab[j] = 1; q.append((nx, ny))
            boxes.append((x0, y0, x1 + 1, y1 + 1, n))
    return boxes


def fit_height(im, height):
    w, h = im.size
    return im.resize((max(1, round(w * height / h)), height), Image.LANCZOS)


def main():
    for src, name, height in PROPS:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print('skip (not found):', src); continue
        im = Image.open(path).convert('RGBA')
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)  # 処理を軽く
        cut_dark_bg(im)
        bbox = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
        im = fit_height(im.crop(bbox), height)
        im.save(os.path.join(OUT, name + '.png'), optimize=True)
        print('wrote', name, im.size)

    # プレイヤー（キャラクターシートから正面・横・背面を切り出す）
    ppath = next((os.path.join(SRC, f) for f in ('Player.png', 'player.png') if os.path.exists(os.path.join(SRC, f))), None)
    if not ppath:
        print('player image not found'); return
    im = Image.open(ppath).convert('RGBA')
    im, seen = cut_white_bg(im)
    w, h = im.size
    boxes = components(seen, w, h)
    # カラーパレットなどの小さな塊は消す
    px = im.load()
    for b in boxes:
        if b[4] < 4000:
            for y in range(b[1], b[3]):
                for x in range(b[0], b[2]):
                    px[x, y] = (255, 255, 255, 0)
    boxes = [b for b in boxes if b[4] >= 4000]
    # 縦長で大きいものが人物。左の大きな立ち絵を除き、右側の3体を使う
    people = [b for b in boxes if (b[3] - b[1]) > (b[2] - b[0]) * 1.3 and (b[3] - b[1]) > 200]
    people.sort(key=lambda b: (b[3] - b[1]) * (b[2] - b[0]), reverse=True)
    big = people[0] if people else None
    small = [b for b in people[1:] if b[0] > w * 0.45]
    small.sort(key=lambda b: (b[1] // 200, b[0]))  # 上段左→上段右→下段
    print('player boxes:', [b[:4] for b in small], 'big:', big[:4] if big else None)
    names = ['player_front', 'player_side', 'player_back']
    for nm, b in zip(names, small):
        part = fit_height(im.crop(b[:4]), 200)
        part.save(os.path.join(OUT, nm + '.png'), optimize=True)
        print('wrote', nm, part.size)
    if big:
        part = fit_height(im.crop(big[:4]), 520)
        part.save(os.path.join(OUT, 'player_portrait.png'), optimize=True)
        print('wrote player_portrait', part.size)


# ---------------- 仲間キャラ（進化前 → 進化後 の並んだ画像） ----------------
CREATURES = ['gekomaru', 'suzune', 'maimai', 'rangyo', 'kodama', 'kohaku', 'kuroro', 'uroko',
             'komori', 'toosibi', 'nejimaru', 'hakua', 'sinonome']
LINE = (92, 70, 58)  # 黒い線をやわらかい焦げ茶に


def cut_cream_bg(im):
    """外周からつながるクリーム色の背景を抜き、(seen, label, comps) を返す"""
    px = im.load()
    w, h = im.size
    seen = bytearray(w * h)

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        if a < 30:
            return True
        return min(r, g) > 228 and b > 200 and r - b < 40 and abs(r - g) < 14

    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i] or not is_bg(x, y):
            continue
        seen[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    # 連結成分のラベル付け
    label = [0] * (w * h)
    comps = []
    cid = 0
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or label[i]:
                continue
            cid += 1
            q = deque([(sx, sy)]); label[i] = cid
            x0 = x1 = sx; y0 = y1 = sy; n = 0; dark = 0; sxs = 0
            while q:
                x, y = q.popleft(); n += 1; sxs += x
                r, g, b, _ = px[x, y]
                if r + g + b < 240: dark += 1
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and not label[j]:
                            label[j] = cid; q.append((nx, ny))
            comps.append({'id': cid, 'box': (x0, y0, x1 + 1, y1 + 1), 'n': n, 'dark': dark / n, 'cx': sxs / n})
    return seen, label, comps


def soften(im, height):
    """線を焦げ茶にして、白いフチ（ステッカー風）とやわらかいボケを付ける"""
    from PIL import ImageFilter
    w, h = im.size
    im = im.resize((max(1, round(w * height / h)), height), Image.LANCZOS)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            lum = (r + g + b) / 3
            if lum < 110:
                t = (110 - lum) / 110 * 0.9
                px[x, y] = (int(r + (LINE[0] - r) * t), int(g + (LINE[1] - g) * t), int(b + (LINE[2] - b) * t), a)
    pad = max(6, height // 22)
    canvas = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(im, (pad, pad))
    alpha = canvas.getchannel('A').point(lambda v: 255 if v > 60 else 0)
    k = max(3, (pad // 2) * 2 + 1)
    rim = alpha.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.GaussianBlur(pad / 3))
    white = Image.new('RGBA', canvas.size, (255, 252, 244, 0))
    white.putalpha(rim.point(lambda v: min(255, int(v * 1.6))))
    white.alpha_composite(canvas.filter(ImageFilter.GaussianBlur(0.5)))
    return white


def round_icon(part, size=128):
    from PIL import ImageDraw
    icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(icon)
    for r in range(size // 2, 0, -1):  # やわらかいクリームのグラデーション
        t = r / (size / 2)
        c = (int(255 - 12 * t), int(250 - 16 * t), int(238 - 26 * t), 255)
        d.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=c)
    p = part.copy()
    p.thumbnail((int(size * 0.84), int(size * 0.84)), Image.LANCZOS)
    icon.alpha_composite(p, ((size - p.width) // 2, (size - p.height) // 2 + 2))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(icon, (0, 0), mask)
    return out


def recolor_lines(im):
    """黒い線をやわらかい焦げ茶に"""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            lum = (r + g + b) / 3
            if lum < 110:
                t = (110 - lum) / 110 * 0.9
                px[x, y] = (int(r + (LINE[0] - r) * t), int(g + (LINE[1] - g) * t), int(b + (LINE[2] - b) * t), a)
    return im


# コマ（丸）に入れるときの顔の位置と拡大率：(横位置, 縦位置, 大きさ) すべて切り抜いた絵に対する割合
TOKEN_FOCUS = {
    'gekomaru': (0.40, 0.52, 0.80), 'gekomaru_e': (0.32, 0.42, 0.62),
    'suzune': (0.33, 0.45, 0.70), 'suzune_e': (0.34, 0.42, 0.60),
    'maimai': (0.30, 0.42, 0.72), 'maimai_e': (0.32, 0.40, 0.62),
    'rangyo': (0.32, 0.42, 0.68), 'rangyo_e': (0.40, 0.45, 0.62),
    'kodama': (0.32, 0.40, 0.66), 'kodama_e': (0.30, 0.38, 0.58),
    'kohaku': (0.45, 0.34, 0.66), 'kohaku_e': (0.30, 0.42, 0.52),
    'kuroro': (0.30, 0.34, 0.66), 'kuroro_e': (0.24, 0.52, 0.56),
    'uroko': (0.34, 0.33, 0.68), 'uroko_e': (0.32, 0.27, 0.58),
    'komori': (0.30, 0.52, 0.70), 'komori_e': (0.30, 0.45, 0.60),
    'toosibi': (0.48, 0.48, 0.78), 'toosibi_e': (0.45, 0.50, 0.66),
    'nejimaru': (0.50, 0.45, 0.78), 'nejimaru_e': (0.50, 0.42, 0.60),
    'hakua': (0.32, 0.36, 0.66), 'hakua_e': (0.36, 0.36, 0.60),
    'sinonome': (0.30, 0.32, 0.66), 'sinonome_e': (0.33, 0.30, 0.58),
}


def make_token(part, size=256, key=None):
    """丸の中にキャラを端までぎっしり詰めたコマを作る。
    体（クリーム色の煙以外）が丸いっぱいになるよう拡大し、残ったすき間はキャラの色をぼかして埋める。"""
    from PIL import ImageFilter, ImageDraw
    im = part.copy()
    if im.height > 520:
        im = im.resize((round(im.width * 520 / im.height), 520), Image.LANCZOS)
    recolor_lines(im)
    w, h = im.size
    px = im.load()
    step = max(1, int((w * h / 40000) ** 0.5))
    xs, ys = [], []
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            if min(r, g) > 215 and b > 185 and (r - b) < 45:  # 煙（クリーム色）は数えない
                continue
            xs.append(x); ys.append(y)
    if len(xs) < 10:
        xs, ys = [0, w], [0, h]
    xs.sort(); ys.sort()
    q = lambda arr, f: arr[int(f * (len(arr) - 1))]
    x0, x1, y0, y1 = q(xs, 0.07), q(xs, 0.93), q(ys, 0.05), q(ys, 0.93)
    bw, bh = x1 - x0, y1 - y0
    if key in TOKEN_FOCUS:
        # 顔が丸の中心に来るよう、キャラごとに指定した位置で切り抜く
        fx, fy, z = TOKEN_FOCUS[key]
        cx, cy, side = w * fx, h * fy, max(w, h) * z
    else:
        cx, cy = x0 + bw * 0.45, y0 + bh * 0.46
        side = max(bw, bh) * 0.85
    box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
    big = size * 2
    crop = im.crop(box).resize((big, big), Image.LANCZOS)

    # すき間を埋める背景：透明部分にまわりの色をにじませる（正規化ぼかし）
    S = 72
    small = crop.resize((S, S), Image.BILINEAR)
    sp = small.load()
    pre = [[(0.0, 0.0, 0.0, 0.0)] * S for _ in range(S)]
    tot = [0.0, 0.0, 0.0, 0.0]
    for y in range(S):
        for x in range(S):
            r, g, b, a = sp[x, y]
            af = a / 255
            pre[y][x] = (r * af, g * af, b * af, af)
            tot[0] += r * af; tot[1] += g * af; tot[2] += b * af; tot[3] += af
    avg = tuple(int(tot[i] / max(tot[3], 1e-6)) for i in range(3))

    def blur(grid, rad):
        out = grid
        for _ in range(3):  # ボックスぼかし×3 ≒ ガウスぼかし
            tmp = [[None] * S for _ in range(S)]
            for y in range(S):
                acc = [0.0] * 4
                row = out[y]
                for x in range(-rad, S + rad):
                    if x + rad < S:
                        v = row[min(S - 1, max(0, x + rad))]
                        acc = [acc[i] + v[i] for i in range(4)]
                    if x - rad - 1 >= 0:
                        v = row[x - rad - 1]
                        acc = [acc[i] - v[i] for i in range(4)]
                    if 0 <= x < S:
                        tmp[y][x] = tuple(a / (2 * rad + 1) for a in acc)
            tmp2 = [[None] * S for _ in range(S)]
            for x in range(S):
                acc = [0.0] * 4
                for y in range(-rad, S + rad):
                    if y + rad < S:
                        v = tmp[min(S - 1, max(0, y + rad))][x]
                        acc = [acc[i] + v[i] for i in range(4)]
                    if y - rad - 1 >= 0:
                        v = tmp[y - rad - 1][x]
                        acc = [acc[i] - v[i] for i in range(4)]
                    if 0 <= y < S:
                        tmp2[y][x] = tuple(a / (2 * rad + 1) for a in acc)
            out = tmp2
        return out

    bl = blur(pre, 5)
    bg = Image.new('RGB', (S, S))
    bp = bg.load()
    for y in range(S):
        for x in range(S):
            r, g, b, a = bl[y][x]
            if a > 0.02:
                c = (r / a, g / a, b / a)
                k = min(1.0, a * 3)
                c = tuple(c[i] * k + avg[i] * (1 - k) for i in range(3))
            else:
                c = avg
            # 少し暗く・濃くして、キャラが浮き立つように
            bp[x, y] = tuple(int(max(0, min(255, v * 0.82))) for v in c)
    bg = bg.resize((big, big), Image.BICUBIC).filter(ImageFilter.GaussianBlur(big / 40)).convert('RGBA')
    bg.alpha_composite(crop)

    # 丸く切り抜き（なめらかなフチ）＋細い縁取り
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, big - 3, big - 3), fill=255)
    out = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(out)
    d.ellipse((2, 2, big - 3, big - 3), outline=(92, 70, 58, 255), width=max(4, big // 64))
    d.ellipse((2 + big // 40, 2 + big // 40, big - 3 - big // 40, big - 3 - big // 40), outline=(255, 250, 235, 110), width=max(2, big // 128))
    return out.resize((size, size), Image.LANCZOS)


def process_creatures():
    for name in CREATURES:
        path = os.path.join(SRC, name + '.png')
        if not os.path.exists(path):
            print('skip (not found):', name); continue
        im = Image.open(path).convert('RGBA')
        if im.height != 640:  # 小さい画像も同じ基準で処理できるよう高さをそろえる
            im = im.resize((round(im.width * 640 / im.height), 640), Image.LANCZOS)
        w, h = im.size
        seen, label, comps = cut_cream_bg(im)
        # 矢印：黒っぽくて横長、画像の中央寄りにある小さめの成分
        cand = [c for c in comps if c['dark'] > 0.55 and 150 <= c['n'] <= w * h * 0.01
                and (c['box'][2] - c['box'][0]) < w * 0.12 and (c['box'][3] - c['box'][1]) < h * 0.12
                and (c['box'][2] - c['box'][0]) >= (c['box'][3] - c['box'][1]) * 1.1
                and w * 0.15 < c['cx'] < w * 0.62]
        if not cand:
            print('arrow not found:', name); continue
        arrow = max(cand, key=lambda c: c['n'])
        big = [c for c in comps if c['n'] >= 40]
        ax = arrow['cx']
        px = im.load()
        for side, sel in (('pre', lambda c: c['cx'] < ax), ('evo', lambda c: c['cx'] > ax)):
            keep = {c['id'] for c in big if c is not arrow and sel(c)}
            if not keep:
                print('part missing', name, side); continue
            boxes = [c['box'] for c in big if c['id'] in keep]
            x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
            x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
            part = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
            pp = part.load()
            for y in range(y0, y1):
                for x in range(x0, x1):
                    if label[y * w + x] in keep:
                        pp[x - x0, y - y0] = px[x, y]
            sprite = soften(part, 180 if side == 'pre' else 230)
            key = 'cr_' + name + ('' if side == 'pre' else '_e')
            sprite.save(os.path.join(OUT, key + '.png'), optimize=True)
            make_token(part, key=name + ('' if side == 'pre' else '_e')).save(os.path.join(OUT, 'ic_' + name + ('' if side == 'pre' else '_e') + '.png'), optimize=True)
            print('wrote', key, sprite.size)


# ---------------- 大妖（ビッグボス）とタイトル画面の背景 ----------------
def make_bigboss_and_title():
    p = os.path.join(SRC, 'BigBoss.png')
    if os.path.exists(p):
        im = Image.open(p).convert('RGBA')
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
        px = im.load()
        w, h = im.size
        seen = bytearray(w * h)

        def is_bg(x, y):
            r, g, b, _ = px[x, y]
            return min(r, g, b) > 225 and max(r, g, b) - min(r, g, b) < 22
        q = deque()
        for x in range(w):
            q.append((x, 0)); q.append((x, h - 1))
        for y in range(h):
            q.append((0, y)); q.append((w - 1, y))
        while q:
            x, y = q.popleft()
            i = y * w + x
            if seen[i] or not is_bg(x, y):
                continue
            seen[i] = 1
            if x > 0: q.append((x - 1, y))
            if x < w - 1: q.append((x + 1, y))
            if y > 0: q.append((x, y - 1))
            if y < h - 1: q.append((x, y + 1))
        for y in range(h):
            for x in range(w):
                if seen[y * w + x]:
                    px[x, y] = (255, 255, 255, 0)
                elif (x and seen[y * w + x - 1]) or (x < w - 1 and seen[y * w + x + 1]):
                    r, g, b, _ = px[x, y]
                    px[x, y] = (r, g, b, int(255 * max(0.35, 1 - smooth(150, 245, (r + g + b) / 3))))
        bbox = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
        im = fit_height(im.crop(bbox), 400)
        im.save(os.path.join(OUT, 'bigboss.png'), optimize=True)
        print('wrote bigboss', im.size)
    t = os.path.join(SRC, 'title_menu.png')
    if os.path.exists(t):
        im = Image.open(t).convert('RGB')
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, 'title_bg.jpg'), quality=84, optimize=True)
        print('wrote title_bg', im.size)


# 新しい敵（images/ の透過PNG）→ assets/ek_*.png（余白を切って縮小）
NEW_ENEMIES = [
    ('雑魚敵lv1_01', 'ek_obake', 128), ('雑魚敵02', 'ek_chochin', 128), ('lv1_Boss', 'ek_boss1', 256),
    ('lv2_01', 'ek_kitsune', 160), ('lv2_02', 'ek_tanuki', 160), ('lv2_Boss', 'ek_boss2', 300),
    ('lv3_kyouteki_01', 'ek_oni', 200), ('lv3_kyouteki_02', 'ek_mujina', 200), ('lv3_Boss', 'ek_boss3', 340),
    ('lv4_Boss', 'ek_boss4', 380),
    ('lv1_03', 'ek_onimen', 140), ('lv1_04', 'ek_karakasa', 140),
    ('lv3_kyouteki_01', 'ek_nushioni', 400), ('lv3_kyouteki_02', 'ek_nushitanuki', 400),  # ヌシ（大きく表示する用）
]


def make_new_enemies():
    for src, key, size in NEW_ENEMIES:
        p = os.path.join(SRC, src + '.png')
        if not os.path.exists(p):
            print('skip', src); continue
        im = Image.open(p).convert('RGBA')
        bbox = im.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
        im = im.crop(bbox)
        sc = size / max(im.size)
        im = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.LANCZOS)
        im.save(os.path.join(OUT, key + '.png'), optimize=True)
        print('wrote', key, im.size)



# ---------------- キャラの新しい絵（images/〇〇02.png・1枚に1体・透過PNG） ----------------
# 妖怪のキー → (進化前の画像, 進化後の画像)
CREATURES_V2 = {
    'gekomaru': ('gokemoaru02', 'gamaberuga02'), 'suzune': ('suzune02', 'suzurion02'),
    'maimai': ('maimai02', 'mokuryuu02'), 'rangyo': ('rangyo02', 'ryuuran02'),
    'kodama': ('kodama02', 'nekomata02'), 'kohaku': ('kohaku02', 'siranui02'),
    'kuroro': ('kuroro02', 'yatagarasu02'), 'komori': ('komori02', 'morigarudo02'),
    'hakua': ('hakua02', 'hakuouga02'), 'sinonome': ('sinonome02', 'kagurajika02'),
    'uroko': ('uroko02', 'urokosinka02'), 'nejimaru': ('nejimaru02', 'tukumogami02'),
}
# コマ（丸アイコン）に入れる顔の位置と大きさ（新しい絵用）
TOKEN_FOCUS_V2 = {
    'gekomaru': (0.42, 0.45, 0.78), 'gekomaru_e': (0.40, 0.45, 0.72),
    'suzune': (0.30, 0.42, 0.62), 'suzune_e': (0.28, 0.45, 0.60),
    'maimai': (0.26, 0.46, 0.66), 'maimai_e': (0.22, 0.42, 0.62),
    'rangyo': (0.24, 0.45, 0.60), 'rangyo_e': (0.30, 0.50, 0.62),
    'kodama': (0.28, 0.42, 0.62), 'kodama_e': (0.20, 0.30, 0.52),
    'kohaku': (0.34, 0.42, 0.66), 'kohaku_e': (0.22, 0.36, 0.50),
    'kuroro': (0.30, 0.32, 0.62), 'kuroro_e': (0.20, 0.30, 0.52),
    'komori': (0.30, 0.46, 0.64), 'komori_e': (0.24, 0.56, 0.62),
    'hakua': (0.30, 0.36, 0.62), 'hakua_e': (0.30, 0.36, 0.62),
    'sinonome': (0.22, 0.46, 0.56), 'sinonome_e': (0.22, 0.46, 0.56),
    'uroko': (0.36, 0.42, 0.78), 'uroko_e': (0.34, 0.38, 0.66),
    'nejimaru': (0.50, 0.46, 0.92), 'nejimaru_e': (0.50, 0.46, 0.86),
}


def process_creatures_v2():
    TOKEN_FOCUS.update(TOKEN_FOCUS_V2)
    for name, files in CREATURES_V2.items():
        for side, src in zip(('pre', 'evo'), files):
            path = os.path.join(SRC, src + '.png')
            if not os.path.exists(path):
                print('skip (not found):', src); continue
            im = Image.open(path).convert('RGBA')
            im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox())
            if im.height > 640:
                im = im.resize((round(im.width * 640 / im.height), 640), Image.LANCZOS)
            suf = '' if side == 'pre' else '_e'
            soften(im, 180 if side == 'pre' else 230).save(os.path.join(OUT, 'cr_' + name + suf + '.png'), optimize=True)
            make_token(im, key=name + suf).save(os.path.join(OUT, 'ic_' + name + suf + '.png'), optimize=True)
            print('wrote', name + suf, 'from', src)


# タイトル画面とロビーの背景（images/titlegamen.png, images/ホーム背景画面.png）
def make_screens():
    for src, out in [('titlegamen.png', 'title_main.jpg'), ('ホーム背景画面.png', 'home_bg.jpg')]:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGB')
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, out), quality=86, optimize=True)
        print('wrote', out, im.size)


if __name__ == '__main__':
    import sys as _sys
    args = _sys.argv[1:]
    if 'big' in args:  # 大妖とタイトル背景だけ作り直す
        make_bigboss_and_title()
    elif 'enemies' in args:  # 新しい敵だけ作り直す
        make_new_enemies()
    elif 'screens' in args:  # タイトルとロビーの背景だけ
        make_screens()
    elif 'v2' in args:  # キャラの新しい絵（〇〇02）だけ
        process_creatures_v2()
    else:
        if 'creatures' not in args:
            main()
        process_creatures()
        make_bigboss_and_title()
        make_new_enemies()
