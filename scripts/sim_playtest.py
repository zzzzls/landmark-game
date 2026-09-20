import asyncio
import json
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
API = "http://127.0.0.1:8000"

FALLBACK_QUERIES = ("故宫", "天坛", "颐和园", "鸟巢", "北海")


async def read_json(ws):
    raw = await ws.recv()
    return json.loads(raw)


async def latest_state(ws, timeout=0.35):
    last = None
    while True:
        try:
            msg = await asyncio.wait_for(read_json(ws), timeout=timeout)
        except asyncio.TimeoutError:
            return last
        if msg.get("type") == "error":
            raise RuntimeError(msg.get("message"))
        if msg.get("type") == "state":
            last = msg
            timeout = 0.15


async def must_state(ws, timeout=2.0):
    st = await latest_state(ws, timeout=timeout)
    if not st:
        raise RuntimeError("no state")
    return st


async def call(ws, obj):
    await ws.send(json.dumps(obj))
    return await must_state(ws)


def merge_pois(dst, extra):
    seen = {p.get("name") for p in dst}
    for p in extra or []:
        name = p.get("name")
        if not name or name in seen:
            continue
        if p.get("lng") is None or p.get("lat") is None:
            continue
        dst.append(p)
        seen.add(name)


def assert_no_score_leak(st, *, check_you=False, label="state"):
    assert st["phase"] == "playing", (label, st.get("phase"))
    assert not st.get("leaderboard"), (label, "leaderboard", st.get("leaderboard"))
    for p in st.get("players") or []:
        assert p.get("totalError") is None, (label, p.get("name"), p.get("totalError"))
    if check_you:
        you = st.get("you") or {}
        assert not you.get("results"), (label, "results", you.get("results"))
        for t in you.get("targets") or []:
            assert "lng" not in t and "lat" not in t, (label, t)
    assert not (st.get("truePins") or []), (label, "truePins")


async def wait_targets(ws, st):
    while not (st.get("you") or {}).get("targets"):
        nxt = await latest_state(ws, 1.0)
        if nxt:
            st = nxt
        else:
            break
    return st


async def pin_three(ws, targets, *, unguess_first=False):
    if unguess_first and targets:
        t0 = targets[0]
        await call(ws, {"type": "guess", "targetId": t0["id"], "lng": 116.39, "lat": 39.91})
        await call(ws, {"type": "unguess", "targetId": t0["id"]})
    for i, t in enumerate(targets):
        await call(
            ws,
            {
                "type": "guess",
                "targetId": t["id"],
                "lng": 116.39 + i * 0.01,
                "lat": 39.91 + i * 0.01,
            },
        )


async def load_search(http):
    search = (await http.get(API + "/api/search", params={"q": "公园"})).json()
    if not isinstance(search, list):
        search = []
    if len(search) < 4:
        for q in FALLBACK_QUERIES:
            hits = (await http.get(API + "/api/search", params={"q": q})).json()
            if isinstance(hits, list):
                merge_pois(search, hits)
            if len(search) >= 4:
                break
    if len(search) < 4:
        from backend.landmarks import CATALOG

        merge_pois(
            search,
            [{"name": p["name"], "lng": p["lng"], "lat": p["lat"]} for p in CATALOG],
        )
    return search


async def main():
    import websockets

    async with httpx.AsyncClient(timeout=10) as http:
        health = (await http.get(API + "/api/health")).json()
        assert health.get("ok")
        room = (await http.post(API + "/api/rooms")).json()["code"]
        search = await load_search(http)
        lan = (await http.get(API + "/api/lan")).json()
        cfg = (await http.get(API + "/api/map-config")).json()
        key_ok = bool(cfg.get("jsKey"))
        print("room", room, "search_n", len(search), "lan", lan, "jsKey_present", key_ok)
        assert len(search) >= 4, "need search results"

    picks = search[:4]
    url = "ws://127.0.0.1:8000/ws/" + room

    async with websockets.connect(url + "/admin?name=host") as admin, websockets.connect(
        url + "/player?name=jia"
    ) as jia, websockets.connect(url + "/player?name=yi") as yi, websockets.connect(
        url + "/screen"
    ) as screen:
        s_admin = await must_state(admin)
        await must_state(jia)
        await must_state(yi)
        await must_state(screen)
        print("joined", s_admin["phase"], [p["name"] for p in s_admin["players"]])

        for ws, pair in ((jia, picks[0:2]), (yi, picks[2:4])):
            for poi in pair:
                st = await call(
                    ws,
                    {
                        "type": "contribute",
                        "name": poi["name"],
                        "lng": poi["lng"],
                        "lat": poi["lat"],
                    },
                )
            print("contributed", [c["name"] for c in st["you"]["contribute"]])

        await latest_state(admin, 0.2)
        st = await call(admin, {"type": "start"})
        print("started", st["phase"])
        assert st["phase"] == "playing"
        assert "screenPins" not in st, "admin must not get screenPins while playing"

        s_jia = await wait_targets(jia, await must_state(jia))
        s_yi = await wait_targets(yi, await must_state(yi))
        jia_targets = s_jia["you"].get("targets") or []
        yi_targets = s_yi["you"].get("targets") or []
        print("jia targets", [t["name"] for t in jia_targets])
        print("yi targets", [t["name"] for t in yi_targets])
        assert len(jia_targets) == 3
        assert len(yi_targets) == 3
        assert all("lng" not in t and "lat" not in t for t in jia_targets)
        assert all("lng" not in t and "lat" not in t for t in yi_targets)

        await pin_three(jia, jia_targets, unguess_first=True)
        st = await call(jia, {"type": "submit"})
        me = [p for p in st["players"] if p["name"] == "jia"][0]
        print("jia submitted", me["submitted"], "err", me["totalError"], "phase", st["phase"])
        assert me["submitted"]
        assert_no_score_leak(st, check_you=True, label="jia-after-submit")

        s_screen = await must_state(screen)
        assert_no_score_leak(s_screen, check_you=False, label="screen-after-jia")
        submitted_ids = {p["id"] for p in s_screen["players"] if p.get("submitted")}
        for sp in s_screen.get("screenPins") or []:
            assert sp["playerId"] in submitted_ids, sp
        assert submitted_ids, "jia should be submitted"

        s_admin = await must_state(admin)
        assert s_admin["phase"] == "playing"
        assert "screenPins" not in s_admin
        assert not (s_admin.get("truePins") or [])

        await pin_three(yi, yi_targets)
        st = await call(yi, {"type": "submit"})
        me = [p for p in st["players"] if p["name"] == "yi"][0]
        print("yi submitted", me["submitted"], "err", me["totalError"], "phase", st["phase"])
        assert st["phase"] == "reveal"

        s_screen = await must_state(screen)
        print(
            "phase",
            s_screen["phase"],
            "board",
            s_screen.get("leaderboard"),
            "pins",
            len(s_screen.get("screenPins") or []),
        )
        assert s_screen["phase"] == "reveal"
        assert s_screen.get("leaderboard"), "screen should have leaderboard"
        assert s_screen.get("truePins"), "reveal should include true pins"
        print("PLAYTEST_OK", room)


if __name__ == "__main__":
    asyncio.run(main())
