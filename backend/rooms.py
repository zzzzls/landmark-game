"""In-memory LAN rooms, assignment, scoring."""

from __future__ import annotations

import asyncio
import math
import random
import secrets
import string
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from .landmarks import CATALOG

COLORS = [
    "#c45c26",
    "#2f6b4f",
    "#3d5a80",
    "#9c2b1f",
    "#6b4c9a",
    "#d4a017",
    "#1d6f8a",
    "#8b4513",
    "#b4236e",
    "#4a7c59",
]

ROOM_TTL_S = 8 * 60 * 60


def haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, a)))


def new_id(prefix: str = "") -> str:
    return f"{prefix}{secrets.token_hex(4)}"


def public_place(item: dict) -> dict:
    return {"id": item["id"], "name": item["name"]}


@dataclass
class Player:
    id: str
    name: str
    color: str
    is_admin: bool = False
    contributions: list[dict] = field(default_factory=list)
    targets: list[dict] = field(default_factory=list)
    guesses: dict[str, dict] = field(default_factory=dict)
    distances: dict[str, int] = field(default_factory=dict)
    total_error: Optional[float] = None
    submitted: bool = False
    connected: bool = True

    def playing(self) -> bool:
        return len(self.contributions) >= 2 and bool(self.targets)


@dataclass
class Connection:
    ws: Any
    role: str
    player_id: Optional[str]


class Room:
    def __init__(self, code: str):
        self.code = code
        self.phase = "lobby"
        self.pool = self._build_pool()
        self.players: dict[str, Player] = {}
        self.connections: list[Connection] = []
        self.created_at = time.time()
        self.lock = asyncio.Lock()
        self.color_i = 0

    def _build_pool(self) -> list[dict]:
        picked = random.sample(CATALOG, k=min(12, len(CATALOG)))
        return [
            {
                "id": f"pool_{item['id']}",
                "name": item["name"],
                "lng": item["lng"],
                "lat": item["lat"],
                "from_pool": True,
            }
            for item in picked
        ]

    def next_color(self) -> str:
        color = COLORS[self.color_i % len(COLORS)]
        self.color_i += 1
        return color

    def add_player(self, name: str, is_admin: bool = False) -> Player:
        player = Player(
            id=new_id("p_"),
            name=name or "玩家",
            color=self.next_color(),
            is_admin=is_admin,
        )
        self.players[player.id] = player
        return player

    def name_taken(self, name: str, is_admin: bool) -> bool:
        return any(
            p.name == name and p.is_admin == is_admin and p.connected
            for p in self.players.values()
        )

    def reclaim(self, name: str, role: str) -> Optional[Player]:
        want_admin = role == "admin"
        connected = None
        for p in self.players.values():
            if p.name == name and p.is_admin == want_admin:
                if not p.connected:
                    p.connected = True
                    return p
                connected = p
        if connected:
            return connected
        if want_admin:
            for p in self.players.values():
                if p.is_admin and not p.connected:
                    p.connected = True
                    if name:
                        p.name = name
                    return p
        return None

    def ready_count(self) -> int:
        return sum(1 for p in self.players.values() if len(p.contributions) >= 2)

    def playing_players(self) -> list[Player]:
        return [p for p in self.players.values() if p.playing()]

    def assign_targets(self) -> None:
        ready = [p for p in self.players.values() if len(p.contributions) >= 2]
        for p in ready:
            own_ids = {c["id"] for c in p.contributions}
            others: list[dict] = []
            for q in self.players.values():
                if q.id == p.id:
                    continue
                others.extend(q.contributions)
            others = [c for c in others if c["id"] not in own_ids]
            pool = [c for c in self.pool if c["id"] not in own_ids]
            selected: list[dict] = []
            selected_ids: set[str] = set()

            if not others:
                # Solo / only one ready player: own 2 contributions + 1 pool item.
                for item in p.contributions:
                    if item["id"] in selected_ids:
                        continue
                    selected.append(item)
                    selected_ids.add(item["id"])
                if pool:
                    pick = random.choice(pool)
                    if pick["id"] not in selected_ids:
                        selected.append(pick)
                        selected_ids.add(pick["id"])
            else:
                if pool:
                    pick = random.choice(pool)
                    selected.append(pick)
                    selected_ids.add(pick["id"])

                combined = [c for c in (others + pool) if c["id"] not in selected_ids]
                random.shuffle(combined)
                for item in combined:
                    if len(selected) >= 3:
                        break
                    if item["id"] in selected_ids:
                        continue
                    selected.append(item)
                    selected_ids.add(item["id"])

            if len(selected) < 3:
                extra = [c for c in CATALOG if f"pool_{c['id']}" not in selected_ids]
                random.shuffle(extra)
                for c in extra:
                    if len(selected) >= 3:
                        break
                    item = {
                        "id": f"fill_{c['id']}_{p.id}",
                        "name": c["name"],
                        "lng": c["lng"],
                        "lat": c["lat"],
                        "from_pool": True,
                    }
                    selected.append(item)

            p.targets = selected[:3]
            p.guesses = {}
            p.distances = {}
            p.total_error = None
            p.submitted = False

    def contribute(self, player: Player, name: str, lng: float, lat: float) -> dict:
        if self.phase != "lobby":
            raise ValueError("现在不能添加地点")
        if len(player.contributions) >= 2:
            raise ValueError("每位玩家只需添加 2 个地点")
        try:
            lng_f = float(lng)
            lat_f = float(lat)
        except (TypeError, ValueError):
            raise ValueError("地点坐标无效")
        item = {
            "id": new_id("c_"),
            "name": name.strip() or "未命名地点",
            "lng": lng_f,
            "lat": lat_f,
        }
        player.contributions.append(item)
        return item

    def remove_contribute(self, player: Player, cid: str) -> None:
        if self.phase != "lobby":
            raise ValueError("开局后不能再改地点")
        player.contributions = [c for c in player.contributions if c["id"] != cid]

    def guess(self, player: Player, target_id: str, lng: float, lat: float) -> None:
        if self.phase != "playing":
            raise ValueError("现在不能钉点")
        if player.submitted:
            raise ValueError("已经提交")
        if not any(t["id"] == target_id for t in player.targets):
            raise ValueError("不是你的题目")
        player.guesses[target_id] = {"lng": float(lng), "lat": float(lat)}

    def unguess(self, player: Player, target_id: str) -> None:
        if self.phase != "playing":
            raise ValueError("现在不能撤销")
        if player.submitted:
            raise ValueError("已经提交")
        if not target_id or target_id not in player.guesses:
            raise ValueError("还没有钉这个点")
        del player.guesses[target_id]

    def submit(self, player: Player) -> None:
        if self.phase != "playing":
            raise ValueError("现在不能提交")
        if player.submitted:
            return
        if not player.targets:
            raise ValueError("你没有题目")
        missing = [t for t in player.targets if t["id"] not in player.guesses]
        if missing:
            raise ValueError("请先为 3 个地点都钉点")
        total = 0.0
        for t in player.targets:
            g = player.guesses[t["id"]]
            dist = int(round(haversine_m(g["lng"], g["lat"], t["lng"], t["lat"])))
            player.distances[t["id"]] = dist
            total += dist
        player.total_error = total
        player.submitted = True
        if self.all_submitted():
            self.phase = "reveal"

    def all_submitted(self) -> bool:
        playing = self.playing_players()
        return bool(playing) and all(p.submitted for p in playing)

    def start(self) -> None:
        if self.phase != "lobby":
            raise ValueError("已经开始")
        if self.ready_count() < 1:
            raise ValueError("至少需要 1 位玩家添加 2 个地点")
        self.assign_targets()
        self.phase = "playing"

    def reveal(self) -> None:
        if self.phase == "lobby":
            raise ValueError("游戏尚未开始")
        self.phase = "reveal"

    def leaderboard(self) -> list[dict]:
        if self.phase != "reveal":
            return []
        submitted = [p for p in self.players.values() if p.submitted and p.total_error is not None]
        submitted.sort(key=lambda p: p.total_error)
        board = []
        for i, p in enumerate(submitted):
            board.append(
                {
                    "name": p.name,
                    "color": p.color,
                    "totalError": p.total_error,
                    "rank": i + 1,
                }
            )
        return board

    def screen_pins(self) -> list[dict]:
        out = []
        for p in self.players.values():
            if self.phase == "playing" and not p.submitted:
                continue
            pins = [
                {"targetId": tid, "lng": g["lng"], "lat": g["lat"]}
                for tid, g in p.guesses.items()
            ]
            if pins:
                out.append(
                    {
                        "playerId": p.id,
                        "name": p.name,
                        "color": p.color,
                        "pins": pins,
                    }
                )
        return out

    def true_pins(self) -> list[dict]:
        seen: set[str] = set()
        out = []
        for p in self.players.values():
            for t in p.targets:
                if t["id"] in seen:
                    continue
                seen.add(t["id"])
                out.append(
                    {
                        "id": t["id"],
                        "name": t["name"],
                        "lng": t["lng"],
                        "lat": t["lat"],
                    }
                )
        return out

    def public_players(self) -> list[dict]:
        return [
            {
                "id": p.id,
                "name": p.name,
                "color": p.color,
                "contributed": len(p.contributions),
                "submitted": p.submitted,
                "totalError": p.total_error if self.phase == "reveal" else None,
                "admin": p.is_admin,
                "connected": p.connected,
            }
            for p in self.players.values()
        ]

    def you_payload(self, player: Optional[Player], role: str) -> dict:
        payload: dict[str, Any] = {"id": player.id if player else None, "role": role}
        if player:
            payload["color"] = player.color
            payload["contribute"] = [
                {"id": c["id"], "name": c["name"], "lng": c["lng"], "lat": c["lat"]}
                for c in player.contributions
            ]
            payload["submitted"] = player.submitted
            payload["guesses"] = [
                {"targetId": tid, "lng": g["lng"], "lat": g["lat"]}
                for tid, g in player.guesses.items()
            ]
            if self.phase in ("playing", "reveal") and player.targets:
                payload["targets"] = [public_place(t) for t in player.targets]
            if self.phase == "reveal" and player.targets:
                payload["results"] = []
                for t in player.targets:
                    g = player.guesses.get(t["id"])
                    payload["results"].append(
                        {
                            "id": t["id"],
                            "name": t["name"],
                            "distance_m": player.distances.get(t["id"]),
                            "lng": t["lng"],
                            "lat": t["lat"],
                            "guessLng": g["lng"] if g else None,
                            "guessLat": g["lat"] if g else None,
                        }
                    )
        return payload

    def snapshot(self, role: str, player: Optional[Player]) -> dict:
        data: dict[str, Any] = {
            "type": "state",
            "phase": self.phase,
            "room": self.code,
            "players": self.public_players(),
            "you": self.you_payload(player, role),
            "leaderboard": self.leaderboard(),
        }
        if role == "screen":
            data["screenPins"] = self.screen_pins()
            if self.phase == "reveal":
                data["truePins"] = self.true_pins()
        elif role == "admin" and self.phase == "reveal":
            data["screenPins"] = self.screen_pins()
            data["truePins"] = self.true_pins()
        return data


class RoomManager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self.lock = asyncio.Lock()

    def _new_code(self) -> str:
        for _ in range(50):
            code = "".join(random.choices(string.ascii_uppercase, k=4))
            if code not in self.rooms:
                return code
        return secrets.token_hex(2).upper()

    def sweep(self) -> None:
        now = time.time()
        dead = [c for c, r in self.rooms.items() if now - r.created_at > ROOM_TTL_S]
        for c in dead:
            self.rooms.pop(c, None)

    def create(self) -> Room:
        self.sweep()
        code = self._new_code()
        room = Room(code)
        self.rooms[code] = room
        return room

    def get(self, code: str) -> Optional[Room]:
        if not code:
            return None
        return self.rooms.get(code.strip().upper())
