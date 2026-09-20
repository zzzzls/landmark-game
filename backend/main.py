"""FastAPI + WebSocket backend for the LAN Beijing landmark game."""

from __future__ import annotations

import json
import os
import socket
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .landmarks import catalog_search
from .rooms import Connection, RoomManager

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

app = FastAPI(title="Beijing Landmark LAN")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = RoomManager()
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "5173"))


def env_key(name: str) -> str:
    return os.getenv(name, "") or ""


def lan_ipv4s() -> list[str]:
    found: set[str] = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                found.add(ip)
    except OSError:
        pass
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        if ip and not ip.startswith("127."):
            found.add(ip)
    except OSError:
        pass
    try:
        out = os.popen("hostname -I").read()
        for ip in out.split():
            if ip.count(".") == 3 and not ip.startswith("127."):
                found.add(ip)
    except OSError:
        pass
    return sorted(found)


async def broadcast(room) -> None:
    stale = []
    for conn in list(room.connections):
        player = room.players.get(conn.player_id) if conn.player_id else None
        try:
            await conn.ws.send_json(room.snapshot(conn.role, player))
        except Exception:
            stale.append(conn)
    for conn in stale:
        if conn in room.connections:
            room.connections.remove(conn)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.post("/api/rooms")
async def create_room():
    room = manager.create()
    return {"code": room.code}


@app.get("/api/rooms/{code}")
async def room_info(code: str):
    room = manager.get(code)
    if not room:
        return JSONResponse({"exists": False}, status_code=404)
    return {
        "exists": True,
        "code": room.code,
        "phase": room.phase,
        "players": len(room.players),
    }


@app.get("/api/map-config")
async def map_config():
    return {"jsKey": env_key("AMAP_JS_KEY")}


@app.get("/api/amap-security.js")
async def amap_security():
    secret = env_key("AMAP_JS_SECRET")
    body = f"window._AMapSecurityConfig={{securityJsCode:{json.dumps(secret)}}};"
    return Response(
        content=body,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/search")
async def search(q: str = Query(default="")):
    q = (q or "").strip()
    if not q:
        return []
    key = env_key("AMAP_WEB_KEY")
    if key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    "https://restapi.amap.com/v3/place/text",
                    params={
                        "key": key,
                        "keywords": q,
                        "city": "北京",
                        "citylimit": "true",
                        "offset": 10,
                        "output": "json",
                    },
                )
            data = resp.json()
            pois = data.get("pois") or []
            results = []
            for poi in pois[:10]:
                loc = poi.get("location") or ""
                if not loc or "," not in str(loc):
                    continue
                lng_s, lat_s = str(loc).split(",")[:2]
                try:
                    lng, lat = float(lng_s), float(lat_s)
                except ValueError:
                    continue
                addr = poi.get("address")
                if isinstance(addr, list):
                    addr = "".join(str(x) for x in addr)
                results.append(
                    {
                        "name": poi.get("name") or "",
                        "address": addr or poi.get("adname") or "北京",
                        "lng": lng,
                        "lat": lat,
                    }
                )
            if results:
                return results
        except Exception:
            pass
    return catalog_search(q, limit=10)


@app.get("/api/lan")
async def lan_urls():
    urls = [f"http://{ip}:{FRONTEND_PORT}" for ip in lan_ipv4s()]
    return {"urls": urls}


@app.websocket("/ws/{code}/{role}")
async def ws_room(websocket: WebSocket, code: str, role: str):
    await websocket.accept()
    name = (websocket.query_params.get("name") or "").strip()
    role = (role or "player").lower()
    if role not in ("player", "admin", "screen"):
        await websocket.send_json({"type": "error", "message": "未知角色"})
        await websocket.close(code=4400)
        return

    room = manager.get(code)
    if not room:
        await websocket.send_json({"type": "error", "message": "房间不存在"})
        await websocket.close(code=4404)
        return

    player = None
    conn = None
    stale: list = []
    async with room.lock:
        if role == "screen":
            conn = Connection(ws=websocket, role="screen", player_id=None)
        else:
            player = room.reclaim(name, role)
            if player is None:
                display = name or ("管理员" if role == "admin" else "玩家")
                if room.name_taken(display, role == "admin"):
                    await websocket.send_json({"type": "error", "message": "这个昵称已经在房间里"})
                    await websocket.close(code=4409)
                    return
                player = room.add_player(display, is_admin=(role == "admin"))
            else:
                stale = [c for c in room.connections if c.player_id == player.id]
                for c in stale:
                    room.connections.remove(c)
            conn = Connection(ws=websocket, role=role, player_id=player.id)
        room.connections.append(conn)

    for old in stale:
        try:
            await old.ws.close()
        except Exception:
            pass

    await broadcast(room)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "无效消息"})
                continue
            mtype = msg.get("type")
            try:
                async with room.lock:
                    if player is None and role != "screen":
                        raise ValueError("未加入房间")
                    if mtype == "contribute" and player:
                        room.contribute(player, msg.get("name") or "", msg.get("lng"), msg.get("lat"))
                    elif mtype == "remove_contribute" and player:
                        room.remove_contribute(player, msg.get("id") or "")
                    elif mtype == "guess" and player:
                        room.guess(player, msg.get("targetId") or "", msg.get("lng"), msg.get("lat"))
                    elif mtype == "unguess" and player:
                        room.unguess(player, msg.get("targetId") or "")
                    elif mtype == "submit" and player:
                        room.submit(player)
                    elif mtype == "start":
                        if role != "admin":
                            raise ValueError("只有管理员可以开始")
                        room.start()
                    elif mtype == "reveal":
                        if role != "admin":
                            raise ValueError("只有管理员可以揭晓")
                        room.reveal()
                    else:
                        raise ValueError("未知操作")
            except ValueError as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
                continue
            except Exception:
                await websocket.send_json({"type": "error", "message": "操作失败"})
                continue
            await broadcast(room)
    except WebSocketDisconnect:
        pass
    finally:
        async with room.lock:
            if conn in room.connections:
                room.connections.remove(conn)
            if player is not None:
                still = any(c.player_id == player.id for c in room.connections)
                if not still:
                    player.connected = False
        try:
            await broadcast(room)
        except Exception:
            pass
