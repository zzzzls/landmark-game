// Curated central-Beijing landmarks. Coordinates are public GCJ-02
// (Amap) points — used only on the server for scoring.
export const LANDMARKS = [
  { id: "tiananmen", name: "天安门", district: "东城区", lng: 116.397499, lat: 39.908722 },
  { id: "gugong", name: "故宫", district: "东城区", lng: 116.397029, lat: 39.917839 },
  { id: "tiantan", name: "天坛", district: "东城区", lng: 116.410829, lat: 39.881913 },
  { id: "yiheyuan", name: "颐和园", district: "海淀区", lng: 116.275179, lat: 39.999617 },
  { id: "niaochao", name: "鸟巢", district: "朝阳区", lng: 116.395784, lat: 39.99333 },
  { id: "shuilifang", name: "水立方", district: "朝阳区", lng: 116.390397, lat: 39.992834 },
  { id: "yuanmingyuan", name: "圆明园", district: "海淀区", lng: 116.300875, lat: 40.006502 },
  { id: "beihai", name: "北海公园", district: "西城区", lng: 116.391802, lat: 39.928775 },
  { id: "jingshan", name: "景山公园", district: "西城区", lng: 116.396551, lat: 39.925875 },
  { id: "ncpa", name: "国家大剧院", district: "西城区", lng: 116.389814, lat: 39.904909 },
  { id: "cctv", name: "央视大楼", district: "朝阳区", lng: 116.463764, lat: 39.915062 },
  { id: "yonghe", name: "雍和宫", district: "东城区", lng: 116.417296, lat: 39.947239 },
  { id: "nanluogu", name: "南锣鼓巷", district: "东城区", lng: 116.402394, lat: 39.937182 },
  { id: "shichahai", name: "什刹海", district: "西城区", lng: 116.385121, lat: 39.941893 },
  { id: "sanlitun", name: "三里屯", district: "朝阳区", lng: 116.45399, lat: 39.934871 },
  { id: "guomao", name: "国贸", district: "朝阳区", lng: 116.459134, lat: 39.910885 },
  { id: "tsinghua", name: "清华大学", district: "海淀区", lng: 116.326936, lat: 40.003213 },
  { id: "pku", name: "北京大学", district: "海淀区", lng: 116.310918, lat: 39.992873 },
  { id: "namoc", name: "中国美术馆", district: "东城区", lng: 116.410887, lat: 39.933321 },
  { id: "wangfujing", name: "王府井", district: "东城区", lng: 116.417754, lat: 39.915119 },
  { id: "weststation", name: "北京西站", district: "丰台区", lng: 116.322033, lat: 39.894912 },
  { id: "olympicpark", name: "奥林匹克公园", district: "朝阳区", lng: 116.393096, lat: 40.00235 },
  { id: "tiananmen-square", name: "天安门广场", district: "东城区", lng: 116.397755, lat: 39.903182 },
  { id: "zhonggulou", name: "钟鼓楼", district: "东城区", lng: 116.395937, lat: 39.940781 },
  { id: "gongwangfu", name: "恭王府", district: "西城区", lng: 116.386315, lat: 39.937222 },
];

export function publicLandmarks() {
  return LANDMARKS.map(({ id, name }) => ({ id, name }));
}

export function byId(id) {
  return LANDMARKS.find((item) => item.id === id) || null;
}
