import { useEffect, useState } from "react";
import Home from "./Home.jsx";
import Player from "./Player.jsx";
import Admin from "./Admin.jsx";
import Screen from "./Screen.jsx";
import { useSession } from "./session.js";

function parsePath() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const legacy = path.match(/^\/r\/[^/]+(?:\/(admin|screen))?$/);
  const role = path === "/admin" || legacy?.[1] === "admin" ? "admin"
    : path === "/screen" || legacy?.[1] === "screen" ? "screen" : "player";
  return { role, legacy: !!legacy };
}
function storedName() {
  const query = new URLSearchParams(location.search).get("name")?.trim();
  try { return query || sessionStorage.getItem("lg-name") || ""; } catch { return query || ""; }
}
export default function App() {
  const [route, setRoute] = useState(parsePath);
  const [name, setName] = useState(storedName);
  const session = useSession(route.role);
  useEffect(() => {
    const onPop = () => { setRoute(parsePath()); setName(storedName()); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (route.legacy) history.replaceState({}, "", `${route.role === "player" ? "/" : `/${route.role}`}${location.search}`);
  }, [route]);
  function remember(value) {
    try { sessionStorage.setItem("lg-name", value); } catch { /* URL fallback */ }
    const url = new URL(location.href);
    url.searchParams.set("name", value);
    history.replaceState({}, "", url.pathname + url.search);
    setName(value);
  }
  const code = session.state?.room;
  if (!code || (route.role !== "screen" && !name))
    return <Home role={route.role} name={name} onName={remember} session={session} />;
  const Page = route.role === "screen" ? Screen : route.role === "admin" ? Admin : Player;
  return <>
    <Page key={`${route.role}-${code}-${name}`} code={code} name={name}
      onRestart={() => session.send({ type: "restart", code })}
      sessionReady={session.status === "connected"} />
    {session.status !== "connected" && <div className="connection-banner" role="status">正在恢复房间联动，操作暂不可用…</div>}
  </>;
}
