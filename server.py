#!/usr/bin/env python3
"""なかまサバイバー サーバー（Python 標準ライブラリのみ）

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
                pid, _, js = line.partition('\t')
                c = clients.get(pid)
                if c and c.joined:
                    c.send_raw('{"t":"st","s":' + js + '}', droppable=True)
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
        c.joined = True
        world.members.add(c.id)
        world.joins.append([c.id, c.name, str(m.get('sp') or '')])
        c.send({'t': 'joined', 'id': c.id, 'seed': world.seed, 'v': VERSION})
        log(c.name, 'joined', '(online %d)' % len(world.members))
    elif t == 'respawn':
        if c.joined:
            world.respawns.append([c.id, str(m.get('sp') or '')])
    elif t == 'leave':
        leave(c)


def leave(c: Client):
    if c.joined:
        c.joined = False
        world.members.discard(c.id)
        world.leaves.append(c.id)
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
    server = await asyncio.start_server(handle, '0.0.0.0', PORT)
    asyncio.create_task(world.run())
    print('=' * 52)
    print(' なかまサバイバー サーバー起動（ずっと続く世界）')
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
