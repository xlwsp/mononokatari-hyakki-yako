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
TICK = 0.05
JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc'
DRIVER = os.path.join(ROOT, 'tools', 'sim_driver.js')
MAX_BUFFER = 1024 * 1024  # 送信が詰まったプレイヤーにはスナップショットを間引く
VERSION = str(int(time.time()))  # キャッシュ対策（起動ごとに変わる）
SAVE_FILE = os.path.join(ROOT, 'tools', 'saves.json')  # tools/ は配信しない


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


class HighScores:
    def __init__(self):
        self.data = {}
        self.dirty = False
        try:
            with open(HS_FILE, encoding='utf-8') as f:
                self.data = json.load(f)
        except Exception:
            self.data = {}

    def put(self, tok, name, d):
        if not tok:
            return
        try:
            sc = int(d['sc'])
        except Exception:
            return
        cur = self.data.get(tok)
        if cur and cur['sc'] >= sc:
            return
        self.data[tok] = {'n': name, 'sc': sc, 'sp': str(d.get('sp', '')), 'lv': int(d.get('lv', 1)), 'ev': 1 if d.get('ev') else 0, 't': int(time.time())}
        self.dirty = True

    def top(self, tok, n=30):
        rows = sorted(self.data.items(), key=lambda kv: -kv[1]['sc'])
        out = [dict(r[1], me=1 if r[0] == tok else 0) for r in rows[:n]]
        mine = None
        for i, (k, v) in enumerate(rows):
            if k == tok:
                mine = dict(v, rank=i + 1)
                break
        return {'list': [{k: v for k, v in r.items() if k != 't'} for r in out], 'mine': mine, 'total': len(rows)}

    def flush(self):
        if not self.dirty:
            return
        self.dirty = False
        tmp = HS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, HS_FILE)


highscores = HighScores()


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
        self.inputs = {}
        self.members = set()
        self.toks = {}  # プレイヤーid → セーブの合言葉
        self.names = {}  # プレイヤーid → 名前（抜けた後に届くスコア用）
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
            if time.monotonic() - self.last_flush > 5:
                self.last_flush = time.monotonic()
                try:
                    saves.flush()
                    highscores.flush()
                except Exception as e:
                    log('save error:', repr(e))
            nxt += TICK
            delay = nxt - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            elif delay < -0.5:
                nxt = time.monotonic()  # 大きく遅れたら追いつこうとしない


world = World()


def handle_msg(c: Client, text: str):
    try:
        m = json.loads(text)
    except Exception:
        return
    t = m.get('t')
    if t == 'in':
        if c.joined:
            try:
                world.inputs[c.id] = [float(m['x']), float(m['y'])]
            except Exception:
                pass
    elif t == 'ch':
        if c.joined:
            world.choices.append([c.id, m.get('s'), m.get('i')])
    elif t == 'join':
        if c.joined:
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
        world.joins.append([c.id, c.name, str(m.get('sp') or ''), state])
        c.send({'t': 'joined', 'id': c.id, 'seed': world.seed, 'v': VERSION, 'cont': 1 if state else 0, 'sp': state['sp'] if state else None})
        log(c.name, 'joined', '(online %d)' % len(world.members))
    elif t == 'respawn':
        if c.joined:
            world.respawns.append([c.id, str(m.get('sp') or '')])
    elif t == 'leave':
        leave(c)
    elif t == 'hs?':
        # ハイスコアランキング
        tok = m.get('tok')
        c.send({'t': 'hs', 'd': highscores.top(tok if valid_tok(tok) else None)})
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

    def on_term():
        saves.flush()  # kill されたときもセーブを書き出してから終わる
        highscores.flush()
        os._exit(0)
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
