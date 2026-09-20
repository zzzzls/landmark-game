import crypto from "node:crypto";
import { LANDMARKS, publicLandmarks, byId } from "./landmarks.js";

const rounds = new Map();
const ROUND_TTL_MS = 2 * 60 * 60 * 1000;

function haversineMeters(lng1, lat1, lng2, lat2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

function scoreFromDistance(meters) {
  return Math.round(1000 * Math.exp(-meters / 2000));
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sweepRounds() {
  const now = Date.now();
  for (const [token, round] of rounds) {
    if (now - round.createdAt > ROUND_TTL_MS) rounds.delete(token);
  }
}

function createRound() {
  sweepRounds();
  const token = crypto.randomBytes(16).toString("hex");
  rounds.set(token, { createdAt: Date.now(), used: false });
  return token;
}

export function createApiMiddleware(env) {
  // Load Web 服务 key on the server even though scoring is local haversine.
  const webKeyLoaded = Boolean(env.AMAP_WEB_KEY);
  void webKeyLoaded;

  return async function apiMiddleware(req, res, next) {
    const url = (req.url || "").split("?")[0];
    if (!url.startsWith("/api/")) {
      next();
      return;
    }

    try {
      if (req.method === "GET" && url === "/api/landmarks") {
        json(res, 200, publicLandmarks());
        return;
      }

      if (req.method === "GET" && url === "/api/round") {
        json(res, 200, { token: createRound() });
        return;
      }

      if (req.method === "GET" && url === "/api/map-config") {
        json(res, 200, { jsKey: env.AMAP_JS_KEY || "" });
        return;
      }

      if (req.method === "GET" && url === "/api/amap-security.js") {
        const code = JSON.stringify(env.AMAP_JS_SECRET || "");
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(`window._AMapSecurityConfig={securityJsCode:${code}};`);
        return;
      }

      if (req.method === "POST" && url === "/api/score") {
        const raw = await readBody(req);
        let payload;
        try {
          payload = JSON.parse(raw || "{}");
        } catch {
          json(res, 400, { error: "invalid_json" });
          return;
        }

        const token = payload.token;
        const guesses = Array.isArray(payload.guesses) ? payload.guesses : [];
        if (!token || !rounds.has(token)) {
          json(res, 400, { error: "invalid_token" });
          return;
        }
        const round = rounds.get(token);
        if (round.used) {
          json(res, 409, { error: "token_used" });
          return;
        }
        round.used = true;

        const guessById = new Map();
        for (const g of guesses) {
          if (!g || typeof g.id !== "string") continue;
          const lng = Number(g.lng);
          const lat = Number(g.lat);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
          guessById.set(g.id, { lng, lat });
        }

        const results = LANDMARKS.map((lm) => {
          const guess = guessById.get(lm.id);
          if (!guess) {
            return {
              id: lm.id,
              name: lm.name,
              guessed: false,
              lng: lm.lng,
              lat: lm.lat,
              guessLng: null,
              guessLat: null,
              distance: null,
              score: 0,
            };
          }
          const distance = Math.round(
            haversineMeters(guess.lng, guess.lat, lm.lng, lm.lat)
          );
          return {
            id: lm.id,
            name: lm.name,
            guessed: true,
            lng: lm.lng,
            lat: lm.lat,
            guessLng: guess.lng,
            guessLat: guess.lat,
            distance,
            score: scoreFromDistance(distance),
          };
        });

        const total = results.reduce((sum, r) => sum + r.score, 0);
        json(res, 200, {
          total,
          max: LANDMARKS.length * 1000,
          results,
        });
        return;
      }

      json(res, 404, { error: "not_found" });
    } catch (err) {
      json(res, 500, { error: "server_error" });
    }
  };
}
