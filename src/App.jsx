import { useEffect, useState } from "react";
import Home from "./Home.jsx";
import Player from "./Player.jsx";
import Admin from "./Admin.jsx";
import Screen from "./Screen.jsx";
function parsePath() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const m = path.match(/^\/r\/([^/]+)(?:\/(admin|screen))?$/);
  return {
    view: m ? m[2] || "player" : "home",
    code: m ? m[1].toUpperCase() : "",
    name:
      new URLSearchParams(location.search).get("name")?.trim() ||
      sessionStorage.getItem("lg-name") ||
      "",
  };
}
export default function App() {
  const [route, setRoute] = useState(parsePath);
  useEffect(() => {
    const onPop = () => setRoute(parsePath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  if (route.view === "screen")
    return <Screen key={route.code} code={route.code} />;
  if (route.view === "home") return <Home />;
  if (!route.name)
    return (
      <Home
        roomCode={route.code}
        suffix={route.view === "admin" ? "/admin" : ""}
      />
    );
  const Page = route.view === "admin" ? Admin : Player;
  return (
    <Page
      key={`${route.view}-${route.code}-${route.name}`}
      code={route.code}
      name={route.name}
    />
  );
}
