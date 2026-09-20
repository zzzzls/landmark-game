"""Rule and public-state regression tests; run with unittest discovery."""

import unittest
from unittest.mock import patch

from backend.landmarks import CATALOG
from backend.rooms import Room, haversine_m, same_place


class RoomRulesTests(unittest.TestCase):
    def setUp(self):
        self.room = Room("TEST")

    def ready(self, name="玩家", admin=False, offset=0):
        player = self.room.add_player(name, is_admin=admin)
        for index in range(2):
            self.room.contribute(player, f"{name}地点{index}", 116.7 + offset + index * 0.02, 40.1)
        return player

    def pin_all(self, player, offset=0):
        for target in player.targets:
            self.room.guess(player, target["id"], target["lng"] + offset, target["lat"])

    def test_single_ready_player_receives_only_system_places(self):
        player = self.ready()
        waiting = self.room.add_player("尚未就绪")
        self.room.contribute(waiting, "唯一贡献", 116.9, 40.2)
        self.room.start()
        self.assertEqual(len(player.targets), 3)
        self.assertTrue(all(t.get("from_pool") for t in player.targets))
        self.assertEqual(waiting.targets, [])
        self.assertNotIn("targets", self.room.you_payload(waiting, "player"))

    def test_system_pool_and_fallback_exclude_own_name_and_nearby_coordinates(self):
        player = self.room.add_player("玩家")
        first, second = CATALOG[:2]
        self.room.contribute(player, " 天 安 门 ", first["lng"], first["lat"])
        self.room.contribute(player, "故宫附近的别名", second["lng"] + 0.0001, second["lat"])
        self.room.pool = []  # Exercise full-catalog fallback, not only sampled pool.
        for _ in range(30):
            self.room.assign_targets()
            self.assertEqual(len(player.targets), 3)
            for target in player.targets:
                self.assertTrue(target["from_pool"])
                self.assertFalse(any(same_place(target, own) for own in player.contributions))
            for i, target in enumerate(player.targets):
                self.assertFalse(any(same_place(target, other) for other in player.targets[i + 1:]))

    def test_multiplayer_excludes_same_place_with_different_ids_and_has_system_question(self):
        first = self.ready("甲")
        second = self.room.add_player("乙")
        self.room.contribute(second, first.contributions[0]["name"], 117.1, 40.3)
        self.room.contribute(second, "同坐标不同名称", first.contributions[1]["lng"], first.contributions[1]["lat"])
        for _ in range(40):
            self.room.assign_targets()
            for player in (first, second):
                self.assertEqual(len(player.targets), 3)
                self.assertTrue(any(t.get("from_pool") for t in player.targets))
                self.assertFalse(any(same_place(t, own) for t in player.targets for own in player.contributions))

    def test_multiplayer_can_receive_other_players_contributions(self):
        first = self.ready("甲")
        second = self.ready("乙", offset=0.2)
        with patch("backend.rooms.random.shuffle", side_effect=lambda items: None):
            self.room.start()
        self.assertTrue(any(t in second.contributions for t in first.targets))
        self.assertTrue(any(t in first.contributions for t in second.targets))

    def test_admin_can_play_or_only_host_and_late_joiner_has_no_targets(self):
        admin = self.room.add_player("房主", is_admin=True)
        player = self.ready()
        self.room.start()
        late = self.room.add_player("迟到玩家")
        self.assertEqual(self.room.playing_players(), [player])
        self.assertEqual(admin.targets, [])
        self.assertEqual(late.targets, [])
        with self.assertRaises(ValueError):
            self.room.contribute(late, "迟到地点", 116.4, 39.9)
        other = Room("SOLO")
        host = other.add_player("参赛房主", is_admin=True)
        other.contribute(host, "甲", 116.8, 40.2)
        other.contribute(host, "乙", 116.9, 40.2)
        other.start()
        self.assertEqual(other.playing_players(), [host])
        self.assertEqual(len(host.targets), 3)

    def test_answer_and_scoring_are_hidden_until_reveal_for_every_role(self):
        first, second = self.ready("甲"), self.ready("乙", offset=0.2)
        self.room.start()
        self.pin_all(first)
        self.room.submit(first)
        self.assertEqual(self.room.phase, "playing")
        for role, viewer in (("player", first), ("admin", second), ("screen", None)):
            state = self.room.snapshot(role, viewer)
            self.assertNotIn("truePins", state)
            self.assertNotIn("results", state["you"])
            self.assertEqual(state["leaderboard"], [])
            self.assertTrue(all(p["totalError"] is None for p in state["players"]))
            for target in state["you"].get("targets", []):
                self.assertEqual(set(target), {"id", "name"})
        self.assertNotIn("screenPins", self.room.snapshot("player", first))
        self.assertNotIn("screenPins", self.room.snapshot("admin", second))
        self.assertEqual(len(self.room.snapshot("screen", None)["screenPins"]), 1)
        self.room.reveal()
        self.assertTrue(self.room.snapshot("screen", None)["truePins"])
        self.assertEqual(self.room.you_payload(first, "player")["results"][0]["distance_m"], 0)

    def test_unsubmitted_pins_stay_private_until_reveal(self):
        player = self.ready()
        self.room.start()
        self.pin_all(player)
        self.assertEqual(self.room.snapshot("screen", None)["screenPins"], [])
        self.room.reveal()
        self.assertEqual(len(self.room.snapshot("screen", None)["screenPins"]), 1)

    def test_submit_requires_all_guesses_and_unguess_removes_only_requested_pin(self):
        player = self.ready()
        self.room.start()
        target = player.targets[0]
        with self.assertRaises(ValueError):
            self.room.submit(player)
        self.room.guess(player, target["id"], 116.1, 40)
        self.room.guess(player, target["id"], 116.2, 40)
        self.assertEqual(player.guesses[target["id"]]["lng"], 116.2)
        self.room.unguess(player, target["id"])
        self.assertEqual(player.guesses, {})
        with self.assertRaises(ValueError):
            self.room.unguess(player, target["id"])
        with self.assertRaises(ValueError):
            self.room.guess(player, "someone-elses-target", 116.4, 39.9)
        self.pin_all(player)
        self.room.unguess(player, target["id"])
        self.assertEqual(len(player.guesses), 2)
        with self.assertRaises(ValueError):
            self.room.submit(player)

    def test_submitted_answer_is_locked_and_double_submit_does_not_change_score(self):
        player = self.ready()
        self.ready("乙", offset=0.2)
        self.room.start()
        self.pin_all(player)
        self.room.submit(player)
        self.room.submit(player)
        self.assertEqual(player.total_error, 0)
        with self.assertRaises(ValueError):
            self.room.guess(player, player.targets[0]["id"], 116.4, 39.9)
        with self.assertRaises(ValueError):
            self.room.unguess(player, player.targets[0]["id"])

    def test_all_submitted_reveals_and_ranking_uses_total_distance(self):
        high, low = self.ready("高误差"), self.ready("零误差", offset=0.2)
        self.room.add_player("仅主持", is_admin=True)
        self.room.start()
        self.pin_all(high, offset=0.01)
        self.pin_all(low)
        self.room.submit(high)
        self.assertFalse(self.room.all_submitted())
        self.assertEqual(self.room.phase, "playing")
        self.room.submit(low)
        self.assertTrue(self.room.all_submitted())
        self.assertEqual(self.room.phase, "reveal")
        board = self.room.leaderboard()
        self.assertEqual([p["name"] for p in board], ["零误差", "高误差"])
        self.assertEqual([p["rank"] for p in board], [1, 2])
        self.assertEqual(high.total_error, sum(high.distances.values()))
        self.assertGreater(board[1]["totalError"], 0)

    def test_early_reveal_preserves_missing_results_as_null_not_zero(self):
        player = self.ready()
        self.room.start()
        first = player.targets[0]
        self.room.guess(player, first["id"], first["lng"], first["lat"])
        self.room.reveal()
        state = self.room.snapshot("player", player)
        self.assertEqual(state["leaderboard"], [])
        self.assertIsNone(state["players"][0]["totalError"])
        self.assertFalse(state["you"]["submitted"])
        self.assertTrue(all(result["distance_m"] is None for result in state["you"]["results"]))
        self.assertIsNone(state["you"]["results"][1]["guessLng"])
        with self.assertRaises(ValueError):
            self.room.submit(player)
        with self.assertRaises(ValueError):
            self.room.unguess(player, first["id"])

    def test_lobby_readiness_and_contribution_mutation_limits(self):
        player = self.room.add_player("玩家")
        with self.assertRaises(ValueError):
            self.room.start()
        with self.assertRaises(ValueError):
            self.room.reveal()
        one = self.room.contribute(player, "甲", 116.8, 40.2)
        self.room.contribute(player, "乙", 116.9, 40.2)
        with self.assertRaises(ValueError):
            self.room.contribute(player, "丙", 117, 40.2)
        self.room.remove_contribute(player, one["id"])
        self.assertEqual(self.room.ready_count(), 0)
        self.room.contribute(player, "甲", 116.8, 40.2)
        self.room.start()
        with self.assertRaises(ValueError):
            self.room.remove_contribute(player, one["id"])
        with self.assertRaises(ValueError):
            self.room.start()

    def test_invalid_coordinates_cannot_poison_contributions_or_guesses(self):
        player = self.room.add_player("玩家")
        invalid = [(float("nan"), 40), (116, float("inf")), (181, 40), (116, -91), (None, 40), ("bad", 40)]
        for lng, lat in invalid:
            with self.subTest(lng=lng, lat=lat), self.assertRaises(ValueError):
                self.room.contribute(player, "无效", lng, lat)
        self.assertEqual(player.contributions, [])
        self.room.contribute(player, "甲", 116.8, 40.2)
        self.room.contribute(player, "乙", 116.9, 40.2)
        self.room.start()
        for lng, lat in invalid:
            with self.subTest(lng=lng, lat=lat), self.assertRaises(ValueError):
                self.room.guess(player, player.targets[0]["id"], lng, lat)
        self.assertEqual(player.guesses, {})
        self.assertAlmostEqual(haversine_m(116, 40, 116, 40), 0)

    def test_reclaim_keeps_existing_game_progress(self):
        player = self.ready()
        self.room.start()
        self.pin_all(player)
        player.connected = False
        reclaimed = self.room.reclaim(player.name, "player")
        self.assertIs(reclaimed, player)
        self.assertTrue(player.connected)
        self.assertEqual(len(player.guesses), 3)
        self.assertEqual(len(self.room.players), 1)


if __name__ == "__main__":
    unittest.main()
