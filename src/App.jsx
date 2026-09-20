import { useEffect, useState } from "react";
import Home from "./Home.jsx";
import Player from "./Player.jsx";
import Admin from "./Admin.jsx";
import Screen from "./Screen.jsx";

function parsePath(pathname, search) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const qs = new URLSearchParams(search);
  const qname = qs.get("name") || sessionStorage.getItem("lg-name") || "";
  const mAdmin = path.match(/^\/r\/([^/]+)\/admin$/);
  if (mAdmin) return { view: "admin", code: mAdmin[1].toUpperCase(), name: qname };
  const mScreen = path.match(/^\/r\/([^/]+)\/screen$/);
  if (mScreen) return { view: "screen", code: mScreen[1].toUpperCase(), name: "" };
  const mPlayer = path.match(/^\/r\/([^/]+)$/);
  if (mPlayer) return { view: "player", code: mPlayer[1].toUpperCase(), name: qname };
  return { view: "home", code: "", name: qname };
}

export default function App() {
  const [route, setRoute] = useState(() =>
    parsePath(window.location.pathname, window.location.search)
  );

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname, window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (route.view === "admin") {
    if (!route.name) return <NameGate code={route.code} suffix="/admin" />;
    return <Admin code={route.code} name={route.name} />;
  }
  if (route.view === "screen") return <Screen code={route.code} />;
  if (route.view === "player") {
    if (!route.name) return <NameGate code={route.code} suffix="" />;
    return <Player code={route.code} name={route.name} />;
  }
  return <Home />;
}

function NameGate({ code, suffix }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  function go(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("请先填写昵称");
      return;
    }
    sessionStorage.setItem("lg-name", n);
    window.history.replaceState({}, "", `/r/${code}${suffix}?name=${encodeURIComponent(n)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  return (
    <div className="home">
      <form className="home-card" onSubmit={go}>
        <header className="home-hero">
          <h1>加入 {code}</h1>
          <p>填写昵称后进入</p>
        </header>
        <label>
          昵称
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            autoComplete="nickname"
            placeholder="例如：小明"
          />
        </label>
        <button type="submit" className="primary">
          进入
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
