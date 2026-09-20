"""FastAPI + WebSocket backend for the LAN Beijing landmark game."""

from __future__ import annotations

import asyncio
import json
import os
import socket
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.websockets import WebSocketState

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


async def safe_send(conn, payload) -> bool:
    try:
        await asyncio.wait_for(conn.ws.send_json(payload), timeout=3)
        return True
    except Exception:
        # Stop the receive task too: removing a failed sender from the list
        # alone leaves a half-alive connection that cannot receive confirmation.
        try:
            await asyncio.wait_for(conn.ws.close(code=1011), timeout=1)
        except Exception:
            pass
        return False


async def broadcast(room) -> None:
    # Serialize broadcasts and send concurrently so one slow screen cannot
    # multiply latency by the number of players.
    async with room.broadcast_lock:
        connections = list(room.connections)
        payloads = [room.snapshot(c.role, room.players.get(c.player_id)) for c in connections]
        sent = await asyncio.gather(*(safe_send(c, p) for c, p in zip(connections, payloads)))
        for conn, ok in zip(connections, sent):
            if not ok and conn in room.connections:
                room.connections.remove(conn)


async def broadcast_session() -> None:
    connections = list(manager.sessions)
    sent = await asyncio.gather(*(safe_send(c, manager.session_snapshot()) for c in connections))
    for conn, ok in zip(connections, sent):
        if not ok and conn in manager.sessions:
            manager.sessions.remove(conn)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.post("/api/rooms")
async def create_room():
    return JSONResponse({"message": "请通过管理员入口创建房间"}, status_code=405)


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


@app.websocket("/ws/session/{role}")
async def ws_session(websocket: WebSocket, role: str):
    await websocket.accept()
    if role not in ("admin", "player", "screen"):
        await websocket.send_json({"type": "error", "message": "未知角色"})
        await websocket.close(code=4400)
        return
    conn = Connection(websocket, role, None)
    async with manager.lock:
        manager.sessions.append(conn)
        await websocket.send_json(manager.session_snapshot())
    try:
        while True:
            raw = await websocket.receive_text()
            request_id = None
            try:
                msg = json.loads(raw)
                if not isinstance(msg, dict):
                    raise ValueError("无效消息")
                request_id = msg.get("requestId")
                async with manager.lock:
                    action = msg.get("type")
                    if action == "sync":
                        await websocket.send_json(manager.session_snapshot())
                        continue
                    if role != "admin":
                        raise ValueError("只有管理员可以创建或重开房间")
                    if not isinstance(request_id, str) or not request_id:
                        raise ValueError("缺少请求编号")
                    if action == "create":
                        room = manager.create_current()
                    elif action == "restart":
                        code = msg.get("code")
                        if not isinstance(code, str):
                            raise ValueError("缺少原房间号")
                        room = manager.restart(code)
                    else:
                        raise ValueError("未知操作")
                    await broadcast_session()
                    await websocket.send_json({"type": "ack", "requestId": request_id, "room": room.code})
            except (ValueError, TypeError) as exc:
                await websocket.send_json({"type": "error", "message": str(exc), "requestId": request_id})
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        # A concurrent broadcast may discover a closed transport before the
        # receive loop does (especially during a whole-room reconnect).
        if websocket.client_state != WebSocketState.DISCONNECTED and websocket.application_state != WebSocketState.DISCONNECTED:
            raise
    finally:
        async with manager.lock:
            if conn in manager.sessions:
                manager.sessions.remove(conn)


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
    if not room or room is not manager.current:
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
            await old.ws.close(code=4409, reason="同名连接已在另一页面接管")
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
            if not isinstance(msg, dict):
                await websocket.send_json({"type": "error", "message": "无效消息"})
                continue
            mtype = msg.get("type")
            try:
                async with room.lock:
                    if room is not manager.current:
                        raise ValueError("房间已经切换，请加入当前房间")
                    if conn not in room.connections:
                        raise ValueError("连接已被接管，请重新连接")
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
    except RuntimeError:
        # A concurrent broadcast may discover a closed transport before the
        # receive loop does (especially during a whole-room reconnect).
        if websocket.client_state != WebSocketState.DISCONNECTED and websocket.application_state != WebSocketState.DISCONNECTED:
            raise
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
