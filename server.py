#!/usr/bin/env python3
"""モノノカタリ -百鬼夜行- サーバー（Python 標準ライブラリのみ）

- HTTP でゲームのファイルを配信
- /ws で WebSocket（プレイヤーの接続）
- ゲームの計算は「ずっと続く1つの世界」として、このサーバーが macOS 標準の
  JavaScriptCore (jsc) で js/sim.js を動かして行う。だれかが抜けても世界は止まらない。

使い方:  python3 server.py [ポート番号]   (既定 8000)
"""
import asyncio
import base64
import hashlib
import itertools
import json
import mimetypes
import os
import random
import socket
import struct
import sys
import time
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8000))
GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
MAX_HUMANS = 50
# 全体チャット（友達と遊ぶ間だけ。Falseにすると消える）
CHAT_ON = True
CHAT_LOG = []  # 最近のチャット（入ってきた人にも見せる）
TICK = 0.05
JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc'
DRIVER = os.path.join(ROOT, 'tools', 'sim_driver.js')
MAX_BUFFER = 1024 * 1024  # 送信が詰まったプレイヤーにはスナップショットを間引く
VERSION = str(int(time.time()))  # キャッシュ対策（起動ごとに変わる）
SAVE_FILE = os.path.join(ROOT, 'tools', 'saves.json')  # tools/ は配信しない
MAINT_FILE = os.path.join(ROOT, 'tools', 'maintenance')  # このファイルがある間はメンテナンス中（遊べない）


# ---------------- セーブ（端末ごとの合言葉 tok で保存。サーバーを再起動しても残る） ----------------
class Saves:
    def __init__(self):
        self.data = {}
        self.dirty = False
        try:
            with open(SAVE_FILE, encoding='utf-8') as f:
                self.data = json.load(f)
        except Exception:
            self.data = {}

    def get(self, tok):
        return self.data.get(tok) if tok else None

    def put(self, tok, state):
        if not tok:
            return
        if state is None:
            if tok in self.data:
                del self.data[tok]
                self.dirty = True
        else:
            self.data[tok] = {'s': state, 't': int(time.time())}
            self.dirty = True

    def flush(self):
        if not self.dirty:
            return
        self.dirty = False
        # 60日遊ばれていないセーブは片付ける
        old = time.time() - 60 * 86400
        self.data = {k: v for k, v in self.data.items() if v.get('t', 0) > old}
        tmp = SAVE_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, separators=(',', ':'))
        os.replace(tmp, SAVE_FILE)


saves = Saves()


# ---------------- ハイスコア（1人＝1端末につき自己ベストを1つ） ----------------
HS_FILE = os.path.join(ROOT, 'tools', 'highscores.json')


WEEK_FILE = os.path.join(ROOT, 'tools', 'weekly.json')
WEEK_REWARDS = [3000, 2000, 1500, 800, 800, 500, 500, 500, 500, 500]   # 週間1〜10位のごほうび（1位は称号「週間王者」も）


def week_id():
    return time.strftime('%G-W%V')  # 月曜はじまりの週


def week_left():
    # 次の月曜0時までの秒数
    lt = time.localtime()
    days = (7 - lt.tm_wday) % 7 or 7
    midnight = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1))
    return int(midnight + days * 86400 - time.time())


class HighScores:
    def __init__(self):
        self.data = {}
        self.dirty = False
        try:
            with open(HS_FILE, encoding='utf-8') as f:
                self.data = json.load(f)
        except Exception:
            self.data = {}

    # ---------- 週間ランキング（月曜0時にリセット。上位にごほうび） ----------
    def _wk_load(self):
        if hasattr(self, 'wk'):
            return
        try:
            with open(WEEK_FILE, encoding='utf-8') as f:
                self.wk = json.load(f)
        except Exception:
            self.wk = {'w': week_id(), 'd': {}}

    def roll_week(self):
        # 週が変わっていたら、先週の順位でごほうびを配ってリセット
        self._wk_load()
        now = week_id()
        if self.wk.get('w') == now:
            return
        rows = sorted(self.wk.get('d', {}).items(), key=lambda kv: -kv[1]['sc'])
        for i, (tok, rec) in enumerate(rows[:len(WEEK_REWARDS)]):
            try:
                profiles.reward(tok, WEEK_REWARDS[i], '🏆 週間ランキング %d位！ +%dP' % (i + 1, WEEK_REWARDS[i]), stat='w1' if i == 0 else None)
            except Exception as e:
                log('weekly reward error:', repr(e))
        log('weekly reset', self.wk.get('w'), '->', now, 'players', len(rows))
        self.wk = {'w': now, 'd': {}}
        self.wk_dirty = True

    def put(self, tok, name, d):
        if not tok:
            return
        try:
            sc = int(d['sc'])
        except Exception:
            return
        self.roll_week()
        wcur = self.wk['d'].get(tok)
        if not wcur or wcur['sc'] < sc:
            self.wk['d'][tok] = {'n': name, 'sc': sc, 'sp': str(d.get('sp', '')), 'lv': int(d.get('lv', 1)), 'ev': 1 if d.get('ev') else 0}
            self.wk_dirty = True
        cur = self.data.get(tok)
        if cur and cur['sc'] >= sc:
            return
        self.data[tok] = {'n': name, 'sc': sc, 'sp': str(d.get('sp', '')), 'lv': int(d.get('lv', 1)), 'ev': 1 if d.get('ev') else 0, 't': int(time.time())}
        self.dirty = True

    def top(self, tok, n=30, weekly=False):
        if weekly:
            self.roll_week()
        rows = sorted((self.wk['d'] if weekly else self.data).items(), key=lambda kv: -kv[1]['sc'])
        out = [dict(r[1], me=1 if r[0] == tok else 0) for r in rows[:n]]
        mine = None
        for i, (k, v) in enumerate(rows):
            if k == tok:
                mine = dict(v, rank=i + 1)
                break
        res = {'list': [{k: v for k, v in r.items() if k != 't'} for r in out], 'mine': mine, 'total': len(rows)}
        if weekly:
            res['left'] = week_left()
            res['rw'] = WEEK_REWARDS
        return res

    def flush(self):
        self.roll_week()
        if getattr(self, 'wk_dirty', False):
            self.wk_dirty = False
            tmp = WEEK_FILE + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(self.wk, f, ensure_ascii=False, separators=(',', ':'))
            os.replace(tmp, WEEK_FILE)
        if not self.dirty:
            return
        self.dirty = False
        tmp = HS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, HS_FILE)


highscores = HighScores()


# ---------------- ガチャポイント・持ち物・装備（端末ごと） ----------------
PROFILE_FILE = os.path.join(ROOT, 'tools', 'profiles.json')
ITEM_TYPES = 10                      # js/sim.js の ITEMS と同じ数・同じ順（小剣・勾玉・赤ファイア・青ファイア・破魔弓・雷太鼓・八咫鏡・羽団扇・小槌・手裏剣）
RARITY_RATES = [50, 28, 15, 6, 1]    # コモン・アンコモン・レア・エピック・レジェンド（%）
GACHA_COST = 100
ITEM_PLUS_MAX = 5                    # 装備の＋強化の上限（js/sim.js と同じ）
DROP_RATES = [0, 40, 35, 18, 7]      # 賞金首を倒したときの装備ドロップ（アンコモン以上）
# 毎日のお題：種類 → (説明, 目標のむずかしさ3段階)。説明は js/scenes/menu.js 側にもある
MISSIONS = {
    'k': ('敵をたおす', [300, 800, 1500]),
    'b': ('ボスをたおす', [2, 4, 8]),
    'pk': ('プレイヤーをたおす', [1, 3, 6]),
    'lv': ('1回のプレイでレベル到達', [25, 50, 80]),
    't': ('あそぶ（秒）', [600, 1200, 1800]),
}
MISSION_PTS = [150, 250, 400]
AWAKE_MAX = 100                      # 覚醒の上限（js/sim.js と同じ）
# 着せ替えの値段（js/sim.js の COSMETICS と同じ順）
COSMETICS = {'tint': [3000, 2000, 2000, 2000, 8000], 'ring': [1500, 1500, 1500, 3000], 'kfx': [2000, 2000, 2000], 'nm': [500, 500, 2000, 5000]}
COS_SLOTS = ['tint', 'ring', 'kfx', 'nm']
COSMETICS['pin'] = [1500, 1000, 800, 1200, 800, 1500]   # ピンズ（エモートに追加。js/sim.js の PINS と同じ順）
# 使い捨ての道具（js/sim.js の CONSUMABLES と同じ）
CONSUMABLES = {'heal': 150, 'inv': 250, 'warp': 120, 'stone': 300, 'poison': 250}
CONS_SLOTS = 3
CONS_MAX = 99
# 妖怪ごとの称号（js/sim.js の SPECIES_ACH と同じ順）
SPECIES_ACH = [('gekomaru', 'k', 5000), ('suzune', 'dist', 1000000), ('maimai', 'hl', 100000), ('rangyo', 'lv', 300),
               ('kodama', 'pk', 50), ('kohaku', 'dg', 300), ('kuroro', 'b', 50), ('uroko', 'su', 3000),
               ('komori', 'sa', 100000), ('toosibi', 'k', 10000), ('nejimaru', 'su', 3000), ('hakua', 'sn', 3000),
               ('sinonome', 'rv', 20)]
SP_STATS = ('hl', 'sa', 'su', 'dist', 'dg', 'sn', 'rv')
SPECIES_LIST = [x[0] for x in SPECIES_ACH]
REC_RUNS = 60   # 戦績：最近のプレイを何件まで覚えるか
# 実績（js/sim.js の ACHIEVEMENTS と同じ順）：(id, 数えるもの, 目標, ごほうび)
ACHIEVEMENTS = [
    ('k1', 'k', 1000, 300), ('k2', 'k', 10000, 1000), ('k3', 'k', 100000, 3000),
    ('b1', 'b', 10, 500), ('b2', 'b', 100, 2000), ('p1', 'pk', 10, 500), ('p2', 'pk', 100, 2000),
    ('bb', 'bb', 1, 1500), ('bt', 'bt', 5, 1000), ('l1', 'lv', 100, 800), ('l2', 'lv', 200, 2000),
    ('t1', 't', 36000, 1000), ('c1', 'ch', 13, 1500), ('c2', 's5', 5, 2000),
    ('i1', 'it', 25, 1000), ('i2', 'it', 50, 3000), ('a1', 'aw', 10, 1000), ('a2', 'aw', 50, 3000), ('w1', 'w1', 1, 0),
]
ACHIEVEMENTS += [('sp_' + sp, sp + ':' + stat, goal, 1500) for sp, stat, goal in SPECIES_ACH]        # むずかしさごとのごほうび
LOGIN_BASE, LOGIN_STEP = 100, 50     # ログインボーナス：1日目100P、連続で+50P（7日目以降400P）
# 妖怪ガチャ（js/sim.js の STARTERS / CHARA_RARITY / CHARA_RATES / STAR_NEED と同じ内容）
STARTERS = ['gekomaru', 'maimai', 'suzune']
CHARA_TIERS = [
    (50, ['gekomaru', 'maimai', 'suzune', 'kodama', 'kohaku']),   # ★
    (30, ['rangyo', 'uroko', 'kuroro']),                          # ★★
    (15, ['nejimaru', 'hakua', 'komori']),                        # ★★★
    (5, ['toosibi', 'sinonome']),                                 # ★★★★
]
STAR_NEED = [1, 2, 4, 8]          # ★1→2 に1体、→3 に2体、→4 に4体、→5 に8体
STAR_MAX_DUPS = sum(STAR_NEED)    # 15体重ねると★5（MAX）
MAX_REFUND = 30                   # ★MAXの妖怪がまた出たらポイントを返す
# 前の「累計EXPで解放」で手に入れていた妖怪は引きつぐ
LEGACY_UNLOCK = {'kodama': 500, 'kohaku': 1200, 'rangyo': 2000, 'uroko': 3000, 'kuroro': 4500,
                 'nejimaru': 6500, 'hakua': 9000, 'komori': 12000, 'toosibi': 16000, 'sinonome': 22000}


def star_of(dups):
    st, acc = 1, 0
    for n in STAR_NEED:
        acc += n
        if dups >= acc:
            st += 1
    return st


class Profiles:
    def __init__(self):
        self.data = {}
        self.dirty = False
        try:
            with open(PROFILE_FILE, encoding='utf-8') as f:
                self.data = json.load(f)
        except Exception:
            self.data = {}

    def get(self, tok):
        p = self.data.get(tok)
        if p is None:
            p = {'pts': 0, 'inv': {}, 'eq': {}}
            if tok:
                self.data[tok] = p
        if 'chars' not in p:
            p['chars'] = {k: 0 for k in STARTERS}   # 妖怪 → 重ねた数
        return p

    def migrate(self, tok, texp):
        # 前の累計EXPで解放していた妖怪をもらう（1回だけ）
        if not tok:
            return
        p = self.get(tok)
        if p.get('mig'):
            return
        try:
            texp = float(texp or 0)
        except (TypeError, ValueError):
            texp = 0
        for k, need in LEGACY_UNLOCK.items():
            if texp >= need:
                p['chars'].setdefault(k, 0)
        p['mig'] = 1
        self.dirty = True

    def owns(self, tok, sp):
        if sp in STARTERS:
            return True
        return bool(tok) and sp in self.data.get(tok, {}).get('chars', {})

    # ---------- 覚醒（★5の妖怪にポイントを使う） ----------
    def awaken(self, tok, sp):
        p = self.get(tok)
        if not tok or not isinstance(sp, str) or p['chars'].get(sp, -1) < STAR_MAX_DUPS:
            return 'ng'
        aw = p.setdefault('aw', {})
        n = aw.get(sp, 0)
        cost = 500 + 250 * n  # js/sim.js の awakeCost と同じ
        if n >= AWAKE_MAX or p['pts'] < cost:
            return 'ng'
        p['pts'] -= cost
        aw[sp] = n + 1
        self.dirty = True
        self.check_ach(tok)
        return 'ok'

    # ---------- 着せ替え ----------
    def cos_buy(self, tok, slot, idx):
        p = self.get(tok)
        if not tok or slot not in COSMETICS or not isinstance(idx, int) or not (1 <= idx <= len(COSMETICS[slot])):
            return
        key = '%s:%d' % (slot, idx)
        own = p.setdefault('cos', [])
        price = COSMETICS[slot][idx - 1]
        if key in own or p['pts'] < price:
            return
        p['pts'] -= price
        own.append(key)
        if slot != 'pin':
            p.setdefault('cse', {})[slot] = idx  # 買ったらすぐ着る
        self.dirty = True

    def cos_equip(self, tok, slot, idx):
        p = self.get(tok)
        if not tok or slot not in COSMETICS or not isinstance(idx, int):
            return
        cse = p.setdefault('cse', {})
        if idx == 0:
            cse.pop(slot, None)
        elif '%s:%d' % (slot, idx) in p.get('cos', []):
            cse[slot] = idx
        self.dirty = True

    def set_title(self, tok, idx):
        p = self.get(tok)
        if not tok or not isinstance(idx, int):
            return
        if idx == 0:
            p['tl'] = 0
        elif 1 <= idx <= len(ACHIEVEMENTS) and ACHIEVEMENTS[idx - 1][0] in p.get('ach', []):
            p['tl'] = idx
        self.dirty = True

    # ---------- 使い捨ての道具（道具屋） ----------
    def cons_buy(self, tok, k, n):
        p = self.get(tok)
        if not tok or k not in CONSUMABLES or not isinstance(n, int) or not (1 <= n <= 10):
            return 'ng'
        cons = p.setdefault('cons', {})
        n = min(n, CONS_MAX - cons.get(k, 0))
        cost = CONSUMABLES[k] * n
        if n <= 0 or p['pts'] < cost:
            return 'ng'
        p['pts'] -= cost
        cons[k] = cons.get(k, 0) + n
        bag = p.setdefault('bag', [])
        if k not in bag and len(bag) < CONS_SLOTS:
            bag.append(k)  # 買ったらすぐ持っていく（空きがあれば）
        self.dirty = True
        return 'ok'

    def cons_bag(self, tok, bag):
        p = self.get(tok)
        if not tok or not isinstance(bag, list):
            return
        out = []
        for k in bag:
            if k in CONSUMABLES and k not in out:
                out.append(k)
        p['bag'] = out[:CONS_SLOTS]
        self.dirty = True

    def use_cons(self, tok, k):
        if not tok:
            return
        cons = self.get(tok).setdefault('cons', {})
        if cons.get(k, 0) > 0:
            cons[k] -= 1
            self.dirty = True

    # ---------- 戦績（1回のプレイ＝やられるまで） ----------
    def add_run(self, tok, d):
        if not tok or not isinstance(d, dict):
            return
        sp = d.get('sp')
        if sp not in SPECIES_LIST:
            return
        num = lambda k: max(0, int(d.get(k) or 0))
        run = {'sp': sp, 'lv': num('lv'), 'ev': 1 if d.get('ev') else 0, 'sc': num('sc'), 'k': num('k'), 'pk': num('pk'),
               'b': num('b'), 't': num('t'), 'by': str(d.get('by') or '')[:12], 'at': int(time.time())}
        rec = self.get(tok).setdefault('rec', {})
        runs = rec.setdefault('runs', [])
        runs.append(run)
        del runs[:-REC_RUNS]
        for key in ('sc', 'pk'):  # スコア・プレイヤーキルの上位10件はずっと残す
            top = rec.setdefault('top_' + key, [])
            top.append(run)
            top.sort(key=lambda r: (-r[key], -r['sc']))
            del top[10:]
        b = rec.setdefault('best', {}).setdefault(sp, {})
        for key in ('lv', 'sc', 'pk', 'k', 't'):
            b[key] = max(b.get(key, 0), run[key])
        b['n'] = b.get('n', 0) + 1
        self.dirty = True

    def records(self, tok):
        if not tok:
            return {}
        return self.get(tok).get('rec', {})

    # ---------- 実績 ----------
    def stats(self, tok):
        p = self.get(tok)
        st = dict(p.get('st', {}))
        st['ch'] = len(p['chars'])
        st['s5'] = sum(1 for v in p['chars'].values() if v >= STAR_MAX_DUPS)
        st['it'] = sum(1 for v in p['inv'].values() if v > 0)
        st['aw'] = sum(p.get('aw', {}).values())
        return st

    def add_stat(self, tok, key, v, mx=False):
        if not tok:
            return
        st = self.get(tok).setdefault('st', {})
        st[key] = max(st.get(key, 0), v) if mx else st.get(key, 0) + v
        self.dirty = True

    def check_ach(self, tok):
        # 新しく達成した実績：ポイントを入れて、お知らせ箱へ
        if not tok:
            return
        p = self.get(tok)
        have = p.setdefault('ach', [])
        st = self.stats(tok)
        for i, (aid, stat, goal, pts) in enumerate(ACHIEVEMENTS):
            if aid not in have and st.get(stat, 0) >= goal:
                have.append(aid)
                p['pts'] += pts
                p.setdefault('inbox', []).append({'k': 'ach', 'i': i + 1, 'pts': pts})
                self.dirty = True

    def reward(self, tok, pts, msg, stat=None):
        p = self.get(tok)
        p['pts'] += pts
        p.setdefault('inbox', []).append({'k': 'msg', 'm': msg})
        if stat:
            self.add_stat(tok, stat, 1)
            self.check_ach(tok)
        self.dirty = True

    def pop_inbox(self, tok):
        if not tok:
            return []
        p = self.get(tok)
        box = p.pop('inbox', [])
        if box:
            self.dirty = True
        return box

    def view(self, tok):
        p = self.get(tok)
        out = {'pts': p['pts'], 'inv': p['inv'], 'eq': p['eq'], 'cost': GACHA_COST, 'chars': p['chars'],
               'aw': p.get('aw', {}), 'cos': p.get('cos', []), 'cse': p.get('cse', {}), 'tl': p.get('tl', 0),
               'ach': p.get('ach', []), 'st': self.stats(tok) if tok else {},
               'cons': p.get('cons', {}), 'bag': p.get('bag', [])}
        if tok:
            dy = self.daily(tok)
            out['dy'] = {'st': dy['st'], 'm': dy['m'], 'lbn': LOGIN_BASE + LOGIN_STEP * (min(dy['st'], 7) - 1)}
        return out

    def gacha_chara(self, tok, times=1):
        p = self.get(tok)
        if not tok or p['pts'] < GACHA_COST * times:
            return None
        got = []
        total = sum(w for w, _ in CHARA_TIERS)
        for i in range(times):
            p['pts'] -= GACHA_COST
            x = random.uniform(0, total)
            tier = 0
            for t, (w, _) in enumerate(CHARA_TIERS):
                x -= w
                if x <= 0:
                    tier = t
                    break
            # 10連は最後の1回で★★以上を確定
            if times == 10 and i == 9 and all(g['r'] == 0 for g in got) and tier == 0:
                tier = random.choices([1, 2, 3], weights=[w for w, _ in CHARA_TIERS[1:]])[0]
            sp = random.choice(CHARA_TIERS[tier][1])
            ch = p['chars']
            g = {'c': sp, 'r': tier}
            if sp not in ch:
                ch[sp] = 0
                g['new'] = 1
            elif ch[sp] >= STAR_MAX_DUPS:
                p['pts'] += MAX_REFUND
                g['rf'] = MAX_REFUND
            else:
                before = star_of(ch[sp])
                ch[sp] += 1
                if star_of(ch[sp]) > before:
                    g['up'] = 1
            g['st'] = star_of(ch[sp])
            g['d'] = ch[sp]
            got.append(g)
        self.dirty = True
        return got

    # ---------- 賞金首のドロップ（レアが出やすい装備） ----------
    def drop_item(self, tok):
        if not tok:
            return None
        p = self.get(tok)
        r = random.choices(range(5), weights=DROP_RATES)[0]
        t = random.randrange(ITEM_TYPES)
        key = '%d_%d' % (t, r)
        p['inv'][key] = p['inv'].get(key, 0) + 1
        self.dirty = True
        return {'t': t, 'r': r, 'n': p['inv'][key]}

    # ---------- 毎日のお題とログインボーナス ----------
    def daily(self, tok):
        p = self.get(tok)
        today = time.strftime('%Y-%m-%d')
        dy = p.get('dy')
        if not dy or dy.get('d') != today:
            last = dy.get('d') if dy else None
            yday = time.strftime('%Y-%m-%d', time.localtime(time.time() - 86400))
            st = (dy.get('st', 0) + 1) if last == yday else 1
            rnd = random.Random(today + (tok or ''))
            kinds = rnd.sample(list(MISSIONS.keys()), 3)
            ms = []
            for k in kinds:
                lvl = rnd.randrange(len(MISSIONS[k][1]))
                ms.append({'k': k, 'g': MISSIONS[k][1][lvl], 'c': 0, 'ok': 0, 'pt': MISSION_PTS[lvl]})
            dy = {'d': today, 'st': st, 'm': ms, 'lb': 0}
            p['dy'] = dy
            if tok:
                self.dirty = True
        return dy

    # 今日のログインボーナス（1日1回）。もらえたら {n, st}
    def login_bonus(self, tok):
        if not tok:
            return None
        dy = self.daily(tok)
        if dy.get('lb'):
            return None
        n = LOGIN_BASE + LOGIN_STEP * (min(dy['st'], 7) - 1)
        dy['lb'] = 1
        self.get(tok)['pts'] += n
        self.dirty = True
        return {'n': n, 'st': dy['st']}

    # お題を進める。deltas: {'k': 増えた数, 'lv': 今のLv} → クリアしたお題のリスト
    def mission_progress(self, tok, deltas):
        if not tok:
            return []
        dy = self.daily(tok)
        done = []
        for m in dy['m']:
            if m['ok'] or m['k'] not in deltas:
                continue
            v = deltas[m['k']]
            c0 = m['c']
            m['c'] = max(m['c'], v) if m['k'] == 'lv' else m['c'] + v
            if m['c'] >= m['g']:
                m['c'] = m['g']; m['ok'] = 1
                self.get(tok)['pts'] += m['pt']
                done.append(m)
            if m['c'] != c0:
                self.dirty = True
        return done

    def add_pts(self, tok, n):
        if not tok:
            return
        self.get(tok)['pts'] += int(n)
        self.dirty = True

    def gacha(self, tok, times=1):
        p = self.get(tok)
        if not tok or p['pts'] < GACHA_COST * times:
            return None
        got = []
        for _ in range(times):
            p['pts'] -= GACHA_COST
            x = random.uniform(0, sum(RARITY_RATES))
            r = 0
            for i, w in enumerate(RARITY_RATES):
                x -= w
                if x <= 0:
                    r = i
                    break
            t = random.randrange(ITEM_TYPES)
            key = '%d_%d' % (t, r)
            p['inv'][key] = p['inv'].get(key, 0) + 1
            got.append({'t': t, 'r': r, 'n': p['inv'][key]})  # n=持っている数（2個目から＋強化）
        self.dirty = True
        return got

    def equip(self, tok, sp, key):
        p = self.get(tok)
        if not tok or not isinstance(sp, str) or len(sp) > 20:
            return
        if key is None:
            p['eq'].pop(sp, None)
        elif isinstance(key, str) and p['inv'].get(key, 0) > 0:
            p['eq'][sp] = key
        self.dirty = True

    def item_for(self, tok, sp):
        # 装備と★（ゲームの中の強さ）
        if not tok:
            return None
        d = self.data.get(tok, {})
        out = {'st': star_of(d.get('chars', {}).get(sp, 0))}
        key = d.get('eq', {}).get(sp)
        if key:
            t, r = key.split('_')
            out['t'], out['r'] = int(t), int(r)
            out['p'] = max(0, min(ITEM_PLUS_MAX, d.get('inv', {}).get(key, 1) - 1))  # ＋強化
        out['aw'] = d.get('aw', {}).get(sp, 0)  # 覚醒
        cse = d.get('cse', {})
        out['cs'] = [cse.get(k, 0) for k in COS_SLOTS]  # 着せ替え
        out['tl'] = d.get('tl', 0)  # 称号
        cons = d.get('cons', {})
        out['cn'] = [k for k in d.get('bag', []) if cons.get(k, 0) > 0][:CONS_SLOTS]  # 持っていく道具
        out['pn'] = [i for i in range(1, len(COSMETICS['pin']) + 1) if 'pin:%d' % i in d.get('cos', [])]  # ピンズ
        return out

    def flush(self):
        if not self.dirty:
            return
        self.dirty = False
        tmp = PROFILE_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, separators=(',', ':'))
        os.replace(tmp, PROFILE_FILE)


profiles = Profiles()


def valid_tok(t):
    return isinstance(t, str) and 16 <= len(t) <= 64 and all(ch in '0123456789abcdef' for ch in t)

mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('image/png', '.png')

_ids = itertools.count(1)
clients = {}


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ---------------- WebSocket ----------------
def ws_frame(payload: bytes, opcode=1) -> bytes:
    n = len(payload)
    head = bytes([0x80 | opcode])
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack('>H', n)
    else:
        head += bytes([127]) + struct.pack('>Q', n)
    return head + payload


async def ws_read(reader):
    """1メッセージ読む。(opcode, bytes) を返す。"""
    buf = b''
    first_op = None
    while True:
        b1, b2 = await reader.readexactly(2)
        fin, op = b1 & 0x80, b1 & 0x0F
        masked, n = b2 & 0x80, b2 & 0x7F
        if n == 126:
            n = struct.unpack('>H', await reader.readexactly(2))[0]
        elif n == 127:
            n = struct.unpack('>Q', await reader.readexactly(8))[0]
        if n > 1 << 20:
            raise ValueError('frame too large')
        mask = await reader.readexactly(4) if masked else b''
        data = await reader.readexactly(n) if n else b''
        if masked and n:
            m = (mask * (n // 4 + 1))[:n]
            data = (int.from_bytes(data, 'big') ^ int.from_bytes(m, 'big')).to_bytes(n, 'big')
        if op >= 8:  # 制御フレーム
            return op, data
        if first_op is None:
            first_op = op
        buf += data
        if fin:
            return first_op, buf


class Client:
    def __init__(self, reader, writer):
        self.id = 'p%d' % next(_ids)
        self.reader, self.writer = reader, writer
        self.name = 'Player'
        self.joined = False
        self.closed = False
        self.tok = None
        self.last_say = 0

    def send_raw(self, text: str, droppable=False):
        if self.closed:
            return
        try:
            if droppable and self.writer.transport.get_write_buffer_size() > MAX_BUFFER:
                return
            self.writer.write(ws_frame(text.encode('utf-8')))
        except Exception:
            self.closed = True

    def send(self, obj):
        self.send_raw(json.dumps(obj, ensure_ascii=False, separators=(',', ':')))


# ---------------- ずっと続く世界 ----------------
class World:
    def __init__(self):
        self.proc = None
        self.seed = 0
        self.joins, self.leaves, self.respawns, self.choices = [], [], [], []
        self.uses, self.emos = [], []
        self.inputs = {}
        self.members = set()
        self.maint = os.path.exists(MAINT_FILE)
        self.maint_check = 0
        self.toks = {}  # プレイヤーid → セーブの合言葉
        self.names = {}  # プレイヤーid → 名前（抜けた後に届くスコア用）
        self.mlast = {}  # プレイヤーid → お題用の前回の数
        self.last_flush = time.monotonic()

    async def start(self):
        self.seed = random.randint(1, 2 ** 31 - 1)
        self.proc = await asyncio.create_subprocess_exec(
            JSC, DRIVER, '--', ROOT, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            limit=1 << 24)
        self.proc.stdin.write((json.dumps({'seed': self.seed}) + '\n').encode())
        await self.proc.stdin.drain()
        log('world started seed', self.seed)

    async def run(self):
        while True:
            try:
                await self.start()
                await self.loop()
            except Exception as e:
                log('world error:', repr(e))
            # 計算プロセスが落ちたら作り直す（参加中の人はタイトルへ戻ってもらう）
            for c in list(clients.values()):
                if c.joined:
                    c.joined = False
                    c.send({'t': 'reset'})
            self.members.clear()
            self.joins, self.leaves, self.respawns, self.choices, self.inputs = [], [], [], [], {}
            try:
                self.proc.kill()
            except Exception:
                pass
            await asyncio.sleep(1)

    async def loop(self):
        nxt = time.monotonic()
        while True:
            cmd = {}
            if self.joins: cmd['join'] = self.joins; self.joins = []
            if self.leaves: cmd['leave'] = self.leaves; self.leaves = []
            if self.respawns: cmd['respawn'] = self.respawns; self.respawns = []
            if self.choices: cmd['ch'] = self.choices; self.choices = []
            if self.uses: cmd['use'] = self.uses; self.uses = []
            if self.emos: cmd['emo'] = self.emos; self.emos = []
            if self.inputs: cmd['in'] = self.inputs; self.inputs = {}
            # jsc は入力を UTF-8 として読まないので、日本語は \u エスケープで渡す
            self.proc.stdin.write((json.dumps(cmd, ensure_ascii=True, separators=(',', ':')) + '\n').encode())
            await self.proc.stdin.drain()
            while True:
                line = await self.proc.stdout.readline()
                if not line:
                    raise RuntimeError('sim process ended')
                line = line.decode('utf-8', 'replace').rstrip('\n')
                if line == '.':
                    break
                if line.startswith('#'):
                    log(line[:300])
                    continue
                if line.startswith('!P\t'):
                    _, pid, n = line.split('\t', 2)
                    try:
                        profiles.add_pts(world.toks.get(pid), int(n))
                    except Exception:
                        pass
                    continue
                if line.startswith('!B\t'):
                    _, pid = line.split('\t', 1)
                    profiles.add_stat(world.toks.get(pid), 'bt', 1)
                    got = profiles.drop_item(world.toks.get(pid))
                    c = clients.get(pid)
                    if got and c:
                        c.send({'t': 'note', 'k': 'drop', 'it': got})
                    continue
                if line.startswith('!U\t'):  # 使い捨ての道具を使った
                    _, pid, k = line.split('\t', 2)
                    profiles.use_cons(world.toks.get(pid), k)
                    continue
                if line.startswith('!R\t'):  # 1回のプレイの記録（戦績）
                    _, pid, js = line.split('\t', 2)
                    try:
                        profiles.add_run(world.toks.get(pid), json.loads(js))
                    except Exception as e:
                        log('run error:', repr(e))
                    continue
                if line.startswith('!K\t'):  # 大妖を倒した
                    _, pid = line.split('\t', 1)
                    profiles.add_stat(world.toks.get(pid), 'bb', 1)
                    continue
                if line.startswith('!M\t'):
                    _, pid, js = line.split('\t', 2)
                    try:
                        cur = json.loads(js)
                        last = world.mlast.get(pid) or {}
                        world.mlast[pid] = cur
                        dl = {}
                        for key in ('k', 'b', 'pk'):
                            v, v0 = cur.get(key, 0), last.get(key, 0)
                            d = v - v0 if v >= v0 else v  # やられて数が戻ったら、そこから数え直し
                            if d > 0:
                                dl[key] = d
                        dl['lv'] = cur.get('lv', 1)
                        if cur.get('a') and last:
                            dl['t'] = 5
                        c = clients.get(pid)
                        tok = world.toks.get(pid)
                        for m in profiles.mission_progress(tok, dl):
                            if c:
                                c.send({'t': 'note', 'k': 'mis', 'm': m})
                        if tok:
                            for key in ('k', 'b', 'pk', 't'):
                                if dl.get(key):
                                    profiles.add_stat(tok, key, dl[key])
                            profiles.add_stat(tok, 'lv', dl['lv'], mx=True)
                            # 妖怪ごとの数（妖怪ごとの称号用）
                            sp = cur.get('sp')
                            if sp in SPECIES_LIST:
                                for key in ('k', 'b', 'pk'):
                                    if dl.get(key):
                                        profiles.add_stat(tok, sp + ':' + key, dl[key])
                                profiles.add_stat(tok, sp + ':lv', dl['lv'], mx=True)
                                st, st0 = cur.get('st') or {}, (last.get('st') or {}) if last.get('sp') == sp else {}
                                for key in SP_STATS:
                                    v, v0 = float(st.get(key, 0) or 0), float(st0.get(key, 0) or 0)
                                    d = v - v0 if v >= v0 else v
                                    if d > 0:
                                        profiles.add_stat(tok, sp + ':' + key, round(d, 1))
                            profiles.check_ach(tok)
                            for n in profiles.pop_inbox(tok):
                                if c:
                                    c.send({'t': 'note', 'k': 'box', 'b': n})
                    except Exception as e:
                        log('mission error:', repr(e))
                    continue
                if line.startswith('!H\t'):
                    _, pid, js = line.split('\t', 2)
                    tok = world.toks.get(pid)
                    c = clients.get(pid)
                    try:
                        highscores.put(tok, c.name if c else world.names.get(pid, 'Player'), json.loads(js))
                    except Exception:
                        pass
                    continue
                if line.startswith('!S\t'):
                    _, pid, js = line.split('\t', 2)
                    tok = world.toks.get(pid)
                    try:
                        saves.put(tok, json.loads(js))
                    except Exception:
                        pass
                    continue
                pid, _, js = line.partition('\t')
                c = clients.get(pid)
                if c and c.joined:
                    c.send_raw('{"t":"st","s":' + js + '}', droppable=True)
            # メンテナンスの開始・終了（tools/maintenance があるかどうか）
            if time.monotonic() - self.maint_check > 1:
                self.maint_check = time.monotonic()
                m = os.path.exists(MAINT_FILE)
                if m and not self.maint:
                    start_maint()
                elif not m and self.maint:
                    self.maint = False
                    log('maintenance end')
            if time.monotonic() - self.last_flush > 5:
                self.last_flush = time.monotonic()
                try:
                    saves.flush()
                    highscores.flush()
                    profiles.flush()
                except Exception as e:
                    log('save error:', repr(e))
            nxt += TICK
            delay = nxt - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            elif delay < -0.5:
                nxt = time.monotonic()  # 大きく遅れたら追いつこうとしない


world = World()


# ---------------- ご意見・バグ報告（このPCの tools/ にだけ保存。外には配信しない） ----------------
FEEDBACK_FILE = os.path.join(ROOT, 'tools', 'feedback.jsonl')
FEEDBACK_HTML = os.path.join(ROOT, 'tools', 'feedback.html')
FB_KINDS = {'review': '⭐ レビュー', 'idea': '🙏 改善してほしい', 'bug': '🐞 バグ報告'}
_fb_last = {}      # 端末ごとの前回の送信時刻（連投よけ）
_fb_recent = []    # 最近1時間の送信時刻（全体の上限）


def save_feedback(tok, m):
    now = time.time()
    key = tok or 'anon'
    if now - _fb_last.get(key, 0) < 60:
        return 'wait'
    _fb_recent[:] = [t for t in _fb_recent if now - t < 3600]
    if len(_fb_recent) >= 100:
        return 'wait'
    text = ''.join(ch for ch in str(m.get('m') or '') if ch >= ' ' or ch == '\n').strip()[:500]
    if len(text) < 2:
        return 'ng'
    kind = m.get('k') if m.get('k') in FB_KINDS else 'idea'
    try:
        st = max(0, min(5, int(m.get('st') or 0)))
    except (TypeError, ValueError):
        st = 0
    rec = {'t': time.strftime('%Y-%m-%d %H:%M:%S'), 'k': kind, 'st': st, 'm': text,
           'n': str(m.get('n') or '')[:12], 'ua': str(m.get('ua') or '')[:160], 'sc': str(m.get('sc') or '')[:20]}
    _fb_last[key] = now
    _fb_recent.append(now)
    with open(FEEDBACK_FILE, 'a', encoding='utf-8') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    write_feedback_html()
    log('feedback:', kind, rec['n'], text[:40].replace('\n', ' '))
    return 'ok'


def write_feedback_html():
    import html as _h
    rows = []
    try:
        with open(FEEDBACK_FILE, encoding='utf-8') as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except Exception:
                    pass
    except FileNotFoundError:
        pass
    col = {'review': '#d8a020', 'idea': '#3a8ae8', 'bug': '#d0503e'}
    cards = []
    for r in reversed(rows):
        stars = ('★' * r.get('st', 0) + '☆' * (5 - r.get('st', 0))) if r.get('k') == 'review' and r.get('st') else ''
        cards.append(
            '<div class="c"><div class="h"><span class="k" style="background:%s">%s</span> <span class="s">%s</span>'
            '<span class="n">%s</span><span class="t">%s</span></div><div class="m">%s</div><div class="u">%s ／ %s</div></div>' % (
                col.get(r.get('k'), '#888'), _h.escape(FB_KINDS.get(r.get('k'), '')), stars, _h.escape(r.get('n') or '（名前なし）'),
                _h.escape(r.get('t', '')), _h.escape(r.get('m', '')).replace('\n', '<br>'), _h.escape(r.get('sc', '')), _h.escape(r.get('ua', ''))))
    count = {k: sum(1 for r in rows if r.get('k') == k) for k in FB_KINDS}
    page = '''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ご意見ボックス</title><style>
body{margin:0;background:#f6ead0;color:#3a2414;font-family:"Hiragino Maru Gothic ProN","M PLUS Rounded 1c",sans-serif;padding:20px}
h1{font-size:24px;margin:0 0 4px}.sum{color:#6a4a2a;margin-bottom:16px}
.c{background:#fff;border:3px solid #8a5a1a;border-radius:14px;padding:12px 14px;margin:0 0 12px;max-width:860px}
.h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px}.k{color:#fff;border-radius:8px;padding:2px 8px;font-weight:bold;font-size:13px}
.s{color:#e0a010}.n{font-weight:bold}.t{color:#8a7a6a;font-size:13px;margin-left:auto}.m{font-size:16px;line-height:1.6;white-space:normal}
.u{color:#a09080;font-size:11px;margin-top:6px;word-break:break-all}
</style></head><body><h1>📮 ご意見ボックス</h1><div class="sum">全%d件（レビュー %d ／ 改善してほしい %d ／ バグ報告 %d）　最終更新 %s　※新しい順。ページを再読み込みすると最新になります</div>%s</body></html>''' % (
        len(rows), count['review'], count['idea'], count['bug'], time.strftime('%Y-%m-%d %H:%M:%S'), ''.join(cards) or '<p>まだ届いていません</p>')
    tmp = FEEDBACK_HTML + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(page)
    os.replace(tmp, FEEDBACK_HTML)


def start_maint():
    """メンテナンス開始：遊んでいる人をロビーへ戻す（セーブは抜けるときに保存される）"""
    world.maint = True
    log('maintenance start')
    for c in list(clients.values()):
        if c.joined:
            c.send({'t': 'maint'})
            leave(c)


def safe_int(v):
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def handle_msg(c: Client, text: str):
    try:
        m = json.loads(text)
    except Exception:
        return
    t = m.get('t')
    if t == 'in':
        if c.joined:
            try:
                world.inputs[c.id] = [float(m['x']), float(m['y']), 1 if m.get('d') else 0]  # d=ダッシュ中
            except Exception:
                pass
    elif t == 'ch':
        if c.joined:
            world.choices.append([c.id, m.get('s'), m.get('i')])
    elif t == 'join':
        if c.joined:
            return
        if world.maint:
            c.send({'t': 'maint'})
            return
        if len(world.members) >= MAX_HUMANS:
            c.send({'t': 'full'})
            return
        c.name = str(m.get('name') or 'Player').strip()[:12] or 'Player'
        tok = m.get('tok')
        tok = tok if valid_tok(tok) else None
        # 同じ端末で2つ同時に遊んでいるときは、後から来た方はセーブしない
        if tok and any(o.joined and o.tok == tok for o in clients.values() if o is not c):
            tok = None
        c.tok = tok
        state = None
        if tok:
            if m.get('cont'):
                rec = saves.get(tok)
                state = rec and rec.get('s')
            else:
                saves.put(tok, None)  # 初めから
            world.toks[c.id] = tok
            world.names[c.id] = c.name
        c.joined = True
        world.members.add(c.id)
        sp = state['sp'] if state else str(m.get('sp') or '')
        if not state and not profiles.owns(tok, sp):
            sp = 'gekomaru'  # 持っていない妖怪では始められない
        world.joins.append([c.id, c.name, sp, state, profiles.item_for(tok, sp)])
        c.send({'t': 'joined', 'id': c.id, 'seed': world.seed, 'v': VERSION, 'cont': 1 if state else 0, 'sp': sp})
        log(c.name, 'joined', '(online %d)' % len(world.members))
        if CHAT_ON:
            c.send({'t': 'say', 'h': CHAT_LOG[-15:]})
    elif t == 'use':
        if c.joined:
            world.uses.append([c.id, safe_int(m.get('i'))])
    elif t == 'emo':
        if c.joined and time.monotonic() - getattr(c, 'last_emo', 0) > 1:
            c.last_emo = time.monotonic()
            world.emos.append([c.id, safe_int(m.get('i'))])
    elif t == 'rec?':
        tok = m.get('tok')
        c.send({'t': 'rec', 'd': profiles.records(tok if valid_tok(tok) else None)})
    elif t == 'respawn':
        if c.joined:
            sp = str(m.get('sp') or '')
            if not profiles.owns(c.tok, sp):
                sp = 'gekomaru'
            world.respawns.append([c.id, sp, profiles.item_for(c.tok, sp)])
    elif t == 'say':
        # 全体チャット：1秒に1回まで・60文字まで
        if CHAT_ON and c.joined and time.monotonic() - c.last_say > 1:
            msg = ''.join(ch for ch in str(m.get('m') or '') if ch >= ' ').strip()[:60]
            if msg:
                c.last_say = time.monotonic()
                row = {'n': c.name, 'm': msg, 'id': c.id}
                CHAT_LOG.append(row)
                del CHAT_LOG[:-30]
                log('[chat]', c.name + ':', msg)
                for o in list(clients.values()):
                    if o.joined:
                        o.send({'t': 'say', 'h': [row]})
    elif t == 'leave':
        leave(c)
    elif t in ('prof?', 'gacha', 'equip', 'awake', 'cos', 'title', 'cons', 'bag'):
        # ガチャ・装備（ロビーから）
        tok = m.get('tok')
        tok = tok if valid_tok(tok) else None
        got = None
        if tok and 'texp' in m:
            profiles.migrate(tok, m.get('texp'))
        if t == 'gacha':
            n = 10 if m.get('n') == 10 else 1
            got = profiles.gacha_chara(tok, n) if m.get('k') == 'chara' else profiles.gacha(tok, n)
        elif t == 'equip':
            profiles.equip(tok, m.get('sp'), m.get('key'))
        elif t == 'awake':
            got = profiles.awaken(tok, m.get('sp'))
        elif t == 'cos':
            if m.get('buy'):
                profiles.cos_buy(tok, m.get('slot'), m.get('i'))
            else:
                profiles.cos_equip(tok, m.get('slot'), m.get('i'))
        elif t == 'title':
            profiles.set_title(tok, m.get('i'))
        elif t == 'cons':
            got = profiles.cons_buy(tok, m.get('k'), m.get('n'))
        elif t == 'bag':
            profiles.cons_bag(tok, m.get('bag'))
        lb = profiles.login_bonus(tok) if t == 'prof?' else None
        if tok:
            profiles.check_ach(tok)
        box = profiles.pop_inbox(tok)
        c.send({'t': 'prof', 'd': dict(profiles.view(tok), got=got, lb=lb, box=box)})
    elif t == 'fb':
        # ご意見・バグ報告
        tok = m.get('tok')
        r = save_feedback(tok if valid_tok(tok) else None, m)
        c.send({'t': 'fbok', 'd': {'ok': r == 'ok', 'wait': r == 'wait'}})
    elif t == 'ping':
        c.send({'t': 'pong', 'd': {'maint': world.maint}})
    elif t == 'hs?':
        # ハイスコアランキング
        tok = m.get('tok')
        c.send({'t': 'hs', 'd': highscores.top(tok if valid_tok(tok) else None, weekly=bool(m.get('w')))})
    elif t == 'save?':
        # タイトル画面用：続きからのデータがあるか
        tok = m.get('tok')
        rec = saves.get(tok) if valid_tok(tok) else None
        st = rec and rec.get('s')
        c.send({'t': 'save', 'd': {'sp': st['sp'], 'lv': st['lv'], 'ev': st['evo']} if st else None})


def leave(c: Client):
    if c.joined:
        c.joined = False
        world.members.discard(c.id)
        world.leaves.append(c.id)
        world.mlast.pop(c.id, None)
        asyncio.get_event_loop().call_later(3, world.toks.pop, c.id, None)
        asyncio.get_event_loop().call_later(3, world.names.pop, c.id, None)  # 抜けたときのセーブを受け取ってから消す
        log(c.name, 'left', '(online %d)' % len(world.members))


async def handle_ws(reader, writer, headers):
    key = headers.get('sec-websocket-key', '')
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    writer.write((
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\nConnection: Upgrade\r\n'
        f'Sec-WebSocket-Accept: {accept}\r\n\r\n').encode())
    c = Client(reader, writer)
    clients[c.id] = c
    try:
        while True:
            op, data = await ws_read(reader)
            if op == 8:
                break
            if op == 9:
                writer.write(ws_frame(data, 10))
                continue
            if op == 1:
                handle_msg(c, data.decode('utf-8', 'replace'))
    except (asyncio.IncompleteReadError, ConnectionError, ValueError):
        pass
    finally:
        c.closed = True
        leave(c)
        clients.pop(c.id, None)
        try:
            writer.close()
        except Exception:
            pass


# ---------------- HTTP ----------------
async def serve_file(writer, path, head_only):
    rel = unquote(urlparse(path).path).lstrip('/') or 'index.html'
    full = os.path.realpath(os.path.join(ROOT, rel))
    parts = rel.split('/')
    ok = (full.startswith(ROOT + os.sep) and os.path.isfile(full)
          and not any(p.startswith('.') for p in parts)
          and not full.endswith(('.py', '.sh')) and parts[0] not in ('tools',))
    if not ok:
        body = b'404 Not Found'
        writer.write(b'HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n'
                     b'Content-Length: %d\r\nConnection: close\r\n\r\n' % len(body) + body)
        return
    ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
    if ctype.startswith('text/') or ctype == 'application/javascript':
        ctype += '; charset=utf-8'
    with open(full, 'rb') as f:
        body = f.read()
    if rel == 'index.html':
        # 古いファイルがブラウザに残らないよう、読み込むファイルにバージョンを付ける
        body = body.replace(b'.js"></script>', b'.js?v=' + VERSION.encode() + b'"></script>')
        body = body.replace(b'__VERSION__', VERSION.encode())
    writer.write((f'HTTP/1.1 200 OK\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n'
                  'Cache-Control: no-store\r\nConnection: close\r\n\r\n').encode())
    if not head_only:
        writer.write(body)


async def handle(reader, writer):
    try:
        head = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 15)
    except Exception:
        writer.close()
        return
    lines = head.decode('latin-1').split('\r\n')
    try:
        method, path, _ = lines[0].split(' ', 2)
    except ValueError:
        writer.close()
        return
    headers = {}
    for line in lines[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.strip().lower()] = v.strip()
    if headers.get('upgrade', '').lower() == 'websocket' and path.startswith('/ws'):
        sock = writer.get_extra_info('socket')
        if sock:
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        await handle_ws(reader, writer, headers)
        return
    if method in ('GET', 'HEAD'):
        await serve_file(writer, path, method == 'HEAD')
    try:
        await writer.drain()
        writer.close()
    except Exception:
        pass


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


async def main():
    if not os.path.exists(JSC):
        print('JavaScriptCore (jsc) が見つかりません。macOS で実行してください。')
        sys.exit(1)
    import signal

    def finish():
        saves.flush()  # kill されたときもセーブを書き出してから終わる
        highscores.flush()
        profiles.flush()
        os._exit(0)

    def on_term():
        # 止める前に、遊んでいる人へ「メンテナンス中」を伝えてロビーへ戻し、最後のセーブを受け取ってから終わる
        if not world.maint:
            start_maint()
        asyncio.get_running_loop().call_later(0.5, finish)
    asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, on_term)
    server = await asyncio.start_server(handle, '0.0.0.0', PORT)
    asyncio.create_task(world.run())
    print('=' * 52)
    print(' モノノカタリ -百鬼夜行- サーバー起動（ずっと続く世界）')
    print(f'  このPC:        http://localhost:{PORT}')
    ip = lan_ip()
    if ip:
        print(f'  同じWi-Fiの人: http://{ip}:{PORT}')
    print('  ネットに公開:  bash start_online.sh')
    print(' 終了: Ctrl+C')
    print('=' * 52, flush=True)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    finally:
        saves.flush()  # 止めるときにセーブを書き出す
        highscores.flush()
        profiles.flush()
