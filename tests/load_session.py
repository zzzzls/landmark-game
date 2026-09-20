"""30-player real WebSocket concurrency check. Run only against an isolated test server.

uv run python tests/load_session.py --url ws://127.0.0.1:8001 --players 30
Exercises actual network frames; it does not claim 30 physical mobile/map devices.
"""
import argparse
import asyncio
import json
import statistics
import time
from urllib.parse import quote
import websockets


class Client:
    def __init__(self, socket):
        self.socket = socket
        self.state = None
        self.messages = []
        self.changed = asyncio.Condition()
        self.task = asyncio.create_task(self.read())

    @classmethod
    async def connect(cls, url):
        return cls(await websockets.connect(url, max_size=2**22))

    async def read(self):
        try:
            async for raw in self.socket:
                message = json.loads(raw)
                async with self.changed:
                    self.messages.append(message)
                    if message['type'] in ('state', 'session'):
                        self.state = message
                    self.changed.notify_all()
        except websockets.ConnectionClosed:
            pass

    async def wait(self, predicate):
        async def inner():
            async with self.changed:
                await self.changed.wait_for(lambda: self.state is not None and predicate(self.state))
                return self.state
        return await asyncio.wait_for(inner(), 15)

    async def send(self, message, predicate):
        started = time.perf_counter()
        await self.socket.send(json.dumps(message))
        result = await self.wait(predicate)
        latencies.append((time.perf_counter() - started) * 1000)
        return result

    async def session_command(self, action, **fields):
        request_id = f'{action}-{time.monotonic_ns()}'
        await self.socket.send(json.dumps({'type': action, 'requestId': request_id, **fields}))
        async def wait():
            async with self.changed:
                await self.changed.wait_for(lambda: any(m.get('requestId') == request_id for m in self.messages))
                message = next(m for m in self.messages if m.get('requestId') == request_id)
                assert message['type'] == 'ack', message
                return message['room']
        return await asyncio.wait_for(wait(), 15)

    async def close(self):
        await self.socket.close()
        await self.task


latencies = []


async def run(url, count):
    started = time.perf_counter()
    clients = []
    async def connect(path):
        c = await Client.connect(url + path)
        clients.append(c)
        return c
    try:
        session = await connect('/ws/session/admin')
        await session.wait(lambda s: True)
        assert session.state['room'] is None, 'Use a fresh isolated server, not an active game.'
        followers = await asyncio.gather(*(connect('/ws/session/player') for _ in range(count)))
        screen_session = await connect('/ws/session/screen')
        await asyncio.gather(*(c.wait(lambda s: s['room'] is None) for c in followers + [screen_session]))
        # Multiple admin windows creating together must receive one room.
        other_admin = await connect('/ws/session/admin')
        await other_admin.wait(lambda s: True)
        codes = await asyncio.gather(session.session_command('create'), other_admin.session_command('create'))
        assert codes[0] == codes[1]
        code = codes[0]
        await asyncio.gather(*(c.wait(lambda s: s['room'] == code) for c in followers + [screen_session]))
        admin = await connect(f'/ws/{code}/admin?name=load-host')
        screen = await connect(f'/ws/{code}/screen')
        players = await asyncio.gather(*(connect(f'/ws/{code}/player?name={quote(f"load-{i:02}")}') for i in range(count)))
        await asyncio.gather(*(p.wait(lambda s: len(s['players']) == count + 1) for p in players + [admin, screen]))
        async def contribute(index, player):
            for point in range(2):
                await player.send({'type': 'contribute', 'name': f'load-{index}-{point}', 'lng': 116.7 + index * .005 + point * .002, 'lat': 40.1}, lambda s: len(s['you'].get('contribute', [])) == point + 1)
        await asyncio.gather(*(contribute(i, p) for i, p in enumerate(players)))
        await admin.send({'type': 'start'}, lambda s: s['phase'] == 'playing')
        await asyncio.gather(*(p.wait(lambda s: len(s['you'].get('targets', [])) == 3) for p in players))
        async def pin(index, player):
            for target in player.state['you']['targets']:
                await player.send({'type': 'guess', 'targetId': target['id'], 'lng': 116.35 + index * .001, 'lat': 39.91}, lambda s: any(g['targetId'] == target['id'] for g in s['you']['guesses']))
        await asyncio.gather(*(pin(i, p) for i, p in enumerate(players)))
        # First finisher gets private score while everyone else remains blind.
        await players[0].send({'type': 'submit'}, lambda s: s['you']['submitted'])
        await screen.wait(lambda s: any(p['submitted'] for p in s['players']))
        assert len(players[0].state['you']['results']) == 3
        assert players[0].state['phase'] == 'playing'
        for client in players[1:] + [admin, screen]:
            assert 'results' not in client.state['you']
            assert 'truePins' not in client.state and 'playerResults' not in client.state
            assert client.state['leaderboard'] == []
            assert all(p['totalError'] is None for p in client.state['players'])
        # Refresh restores the confirmed pins and identity.
        before = players[-1].state['you']['id']
        await players[-1].close()
        players[-1] = await connect(f'/ws/{code}/player?name=load-{count-1:02}')
        await players[-1].wait(lambda s: len(s['you']['guesses']) == 3)
        assert players[-1].state['you']['id'] == before
        await asyncio.gather(*(p.send({'type': 'submit'}, lambda s: s['you']['submitted']) for p in players[1:]))
        await asyncio.gather(*(p.wait(lambda s: s['phase'] == 'reveal') for p in players + [admin, screen]))
        board = screen.state['leaderboard']
        assert len(board) == count
        assert [p['totalError'] for p in board] == sorted(p['totalError'] for p in board)
        assert len({p['playerId'] for p in board}) == count
        rows = screen.state['playerResults']
        assert sum(len(p['results']) == 3 for p in rows) == count
        assert all(p['totalError'] == sum(r['distance_m'] for r in p['results']) for p in rows if p['submitted'])
        # An offline global client catches the new room on reconnect.
        await followers[-1].close()
        successors = await asyncio.gather(session.session_command('restart', code=code), other_admin.session_command('restart', code=code))
        assert successors[0] == successors[1] and successors[0] != code
        new_code = successors[0]
        await asyncio.gather(*(c.wait(lambda s: s['room'] == new_code) for c in followers[:-1] + [screen_session]))
        restored = await connect('/ws/session/player')
        await restored.wait(lambda s: s['room'] == new_code)
        fresh_players = await asyncio.gather(*(connect(f'/ws/{new_code}/player?name=load-{i:02}') for i in range(count)))
        await asyncio.gather(*(c.wait(lambda s: len(s['players']) == count) for c in fresh_players))
        assert all(c.state['you']['contribute'] == [] and c.state['you']['guesses'] == [] for c in fresh_players)
        errors = [m for c in clients for m in c.messages if m['type'] == 'error']
        assert errors == [], errors
        result = {'players': count, 'status': 'passed', 'commands_measured': len(latencies), 'latency_ms': {'p50': round(statistics.median(latencies), 2), 'p95': round(sorted(latencies)[int(len(latencies)*.95)], 2), 'max': round(max(latencies), 2)}, 'errors': len(errors), 'elapsed_s': round(time.perf_counter()-started, 2), 'coverage': ['parallel_join_and_contribute', 'private_results', '30_submit_reveal', 'refresh_restore', 'concurrent_create_restart', 'missed_restart_reconnect', '30_new_room_joins']}
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        await asyncio.gather(*(c.close() for c in clients), return_exceptions=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='ws://127.0.0.1:8001')
    parser.add_argument('--players', type=int, default=30)
    args = parser.parse_args()
    asyncio.run(run(args.url.rstrip('/'), args.players))
