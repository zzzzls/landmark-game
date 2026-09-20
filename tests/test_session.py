"""Real ASGI WebSocket protocol tests, including session and privacy boundaries."""
import unittest
from contextlib import ExitStack
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from backend import main
from backend.rooms import Connection, Room, RoomManager


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.previous = main.manager
        main.manager = RoomManager()
        self.client = TestClient(main.app)

    def tearDown(self):
        main.manager = self.previous

    def request(self, socket, kind, **fields):
        socket.send_json({'type': kind, 'requestId': kind, **fields})
        while True:
            message = socket.receive_json()
            if message['type'] in ('ack', 'error'):
                return message

    def test_wait_roles_idempotence_restart_and_stale_actions(self):
        with ExitStack() as stack:
            admin = stack.enter_context(self.client.websocket_connect('/ws/session/admin'))
            player = stack.enter_context(self.client.websocket_connect('/ws/session/player'))
            screen = stack.enter_context(self.client.websocket_connect('/ws/session/screen'))
            for socket in (admin, player, screen):
                self.assertEqual(socket.receive_json(), {'type': 'session', 'room': None})
            self.assertEqual(self.client.post('/api/rooms').status_code, 405)
            self.assertEqual(self.request(player, 'create')['type'], 'error')
            first = self.request(admin, 'create')['room']
            self.assertEqual(player.receive_json()['room'], first)
            self.assertEqual(screen.receive_json()['room'], first)
            self.assertEqual(self.request(admin, 'create')['room'], first)
            self.assertEqual(self.request(admin, 'restart', code=first)['type'], 'error')
            game = stack.enter_context(self.client.websocket_connect(f'/ws/{first}/player?name=test'))
            self.assertEqual(game.receive_json()['room'], first)
            main.manager.current.phase = 'reveal'
            second = self.request(admin, 'restart', code=first)['room']
            self.assertNotEqual(first, second)
            self.assertEqual(self.request(admin, 'restart', code=first)['room'], second)
            self.assertEqual(len(main.manager.rooms), 2)
            game.send_json({'type': 'contribute', 'name': 'old', 'lng': 116, 'lat': 40})
            self.assertEqual(game.receive_json()['type'], 'error')
            reconnect = stack.enter_context(self.client.websocket_connect('/ws/session/player'))
            self.assertEqual(reconnect.receive_json()['room'], second)
            reconnect.send_json({'type': 'sync'})
            self.assertEqual(reconnect.receive_json()['room'], second)

    def test_same_name_takeover_closes_old_connection_and_keeps_identity(self):
        room = main.manager.create_current()
        with self.client.websocket_connect(f'/ws/{room.code}/player?name=same') as old:
            player_id = old.receive_json()['you']['id']
            with self.client.websocket_connect(f'/ws/{room.code}/player?name=same') as new:
                self.assertEqual(new.receive_json()['you']['id'], player_id)
                close = old.receive()
                self.assertEqual(close['type'], 'websocket.close')
                self.assertEqual(close['code'], 4409)
                self.assertEqual(len(room.connections), 1)
                self.assertEqual(room.connections[0].player_id, player_id)
                new.send_json({'type': 'contribute', 'name': 'new', 'lng': 116, 'lat': 40})
                state = new.receive_json()
                self.assertEqual(state['you']['contribute'][0]['name'], 'new')
                self.assertEqual(len(room.players), 1)

    def test_malformed_protocol_stays_alive(self):
        with self.client.websocket_connect('/ws/session/admin') as socket:
            socket.receive_json()
            for raw in ('[]', '{', 'null'):
                socket.send_text(raw)
                self.assertEqual(socket.receive_json()['type'], 'error')
            self.assertEqual(self.request(socket, 'create')['type'], 'ack')

    def test_reveal_rows_have_three_places_and_stable_ids(self):
        room = main.manager.create_current()
        players = [room.add_player('same', is_admin=index == 1) for index in range(2)]
        host = room.add_player('spectator')
        for index, player in enumerate(players):
            for point in range(2):
                room.contribute(player, f'{index}-{point}', 117 + index * .1 + point * .02, 40)
        room.start()
        for target in players[0].targets:
            room.guess(players[0], target['id'], 116, 40)
        room.submit(players[0])
        private = room.snapshot('player', players[0])
        self.assertEqual(len(private['you']['results']), 3)
        self.assertNotIn('playerResults', private)
        self.assertEqual(private['leaderboard'], [])
        self.assertNotIn('results', room.snapshot('admin', players[1])['you'])
        room.reveal()
        state = room.snapshot('screen', None)
        self.assertEqual(state['leaderboard'][0]['playerId'], players[0].id)
        rows = state['playerResults']
        self.assertEqual([row['playerId'] for row in rows], [p.id for p in players] + [host.id])
        self.assertEqual([len(row['results']) for row in rows], [3, 3, 0])
        self.assertIsNone(rows[1]['totalError'])
        self.assertIsNone(rows[1]['rank'])
        self.assertFalse(rows[2]['participating'])


class BroadcastFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_send_closes_and_removes_connection(self):
        room = Room("FAIL")
        socket = AsyncMock()
        socket.send_json.side_effect = OSError("connection lost")
        connection = Connection(socket, "screen", None)
        room.connections.append(connection)
        await main.broadcast(room)
        socket.close.assert_awaited_once_with(code=1011)
        self.assertEqual(room.connections, [])
