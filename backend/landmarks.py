"""Server-side Beijing landmark catalog. GCJ-02 coords stay on the server."""

CATALOG = [
    {"id": "tiananmen", "name": "天安门", "lng": 116.397499, "lat": 39.908722},
    {"id": "gugong", "name": "故宫", "lng": 116.397029, "lat": 39.917839},
    {"id": "tiantan", "name": "天坛", "lng": 116.410829, "lat": 39.881913},
    {"id": "yiheyuan", "name": "颐和园", "lng": 116.275179, "lat": 39.999617},
    {"id": "niaochao", "name": "鸟巢", "lng": 116.395784, "lat": 39.99333},
    {"id": "shuilifang", "name": "水立方", "lng": 116.390397, "lat": 39.992834},
    {"id": "yuanmingyuan", "name": "圆明园", "lng": 116.300875, "lat": 40.006502},
    {"id": "beihai", "name": "北海", "lng": 116.391802, "lat": 39.928775},
    {"id": "jingshan", "name": "景山", "lng": 116.396551, "lat": 39.925875},
    {"id": "ncpa", "name": "国家大剧院", "lng": 116.389814, "lat": 39.904909},
    {"id": "cctv", "name": "央视大楼", "lng": 116.463764, "lat": 39.915062},
    {"id": "yonghe", "name": "雍和宫", "lng": 116.417296, "lat": 39.947239},
    {"id": "nanluogu", "name": "南锣鼓巷", "lng": 116.402394, "lat": 39.937182},
    {"id": "shichahai", "name": "什刹海", "lng": 116.385121, "lat": 39.941893},
    {"id": "sanlitun", "name": "三里屯", "lng": 116.45399, "lat": 39.934871},
    {"id": "guomao", "name": "国贸", "lng": 116.459134, "lat": 39.910885},
    {"id": "tsinghua", "name": "清华", "lng": 116.326936, "lat": 40.003213},
    {"id": "pku", "name": "北大", "lng": 116.310918, "lat": 39.992873},
    {"id": "wangfujing", "name": "王府井", "lng": 116.417754, "lat": 39.915119},
    {"id": "weststation", "name": "北京西站", "lng": 116.322033, "lat": 39.894912},
    {"id": "olympicpark", "name": "奥林匹克公园", "lng": 116.393096, "lat": 40.00235},
    {"id": "zhonggulou", "name": "钟鼓楼", "lng": 116.395937, "lat": 39.940781},
    {"id": "gongwangfu", "name": "恭王府", "lng": 116.386315, "lat": 39.937222},
    {"id": "tiananmen-square", "name": "天安门广场", "lng": 116.397755, "lat": 39.903182},
    {"id": "namoc", "name": "中国美术馆", "lng": 116.410887, "lat": 39.933321},
]


def catalog_search(q: str, limit: int = 10) -> list[dict]:
    q = (q or "").strip()
    if not q:
        return []
    matched = [p for p in CATALOG if q in p["name"]]
    items = matched
    out = []
    for p in items[:limit]:
        out.append(
            {
                "name": p["name"],
                "address": "北京",
                "lng": p["lng"],
                "lat": p["lat"],
            }
        )
    return out
