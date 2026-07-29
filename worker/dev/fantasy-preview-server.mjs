import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local visual QA helper; it is intentionally kept outside the test discovery tree.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
const port = Number(process.argv[2] || 8768);

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const division = url.searchParams.get("division") === "ascension" ? "ascension" : "elite";
  if (url.pathname === "/api/fantasy/me") return json(response, { authenticated: false, user: null, isAdmin: false });
  if (url.pathname === "/api/fantasy/config") {
    return json(response, {
      division,
      round: {
        id: `${division}-r2`,
        division,
        round_number: 2,
        name: "Rodada 2",
        status: "open",
        opens_at: "2026-07-29T00:00:00.000Z",
        locks_at: "2026-08-01T18:35:00.000Z"
      },
      market: {
        id: "global",
        status: "open",
        roundNumber: 2,
        closesAt: "2026-08-01T18:35:00.000Z",
        timezone: "America/Sao_Paulo",
        lockMinutes: 25
      },
      rules: { budget: 100, maxPlayersPerRealTeam: 2 }
    });
  }
  if (url.pathname === "/api/fantasy/market") {
    const roles = ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"];
    return json(response, {
      division,
      market: roles.map((role, index) => ({
        id: role === "TEAM" ? `team:${division}:A1` : `${division}-player-${role}`,
        type: role === "TEAM" ? "team" : "player",
        role,
        name: role === "TEAM" ? "EQUIPE A1" : `JOGADOR ${role}`,
        teamSlot: "A1",
        teamName: "EQUIPE A1",
        teamTag: "A1",
        logo: "",
        price: 12 + index,
        previousPrice: 12 + index,
        average: 70 + index,
        recentPoints: [68 + index, 72 + index],
        matchup: "vs A3"
      })),
      marketState: { status: "open", roundNumber: 2, closesAt: "2026-08-01T18:35:00.000Z" }
    });
  }
  if (url.pathname === "/api/fantasy/popular") return json(response, { division, popular: [], highlights: {} });
  if (url.pathname === "/api/fantasy/ranking") return json(response, { division, ranking: [] });
  if (url.pathname === "/api/fantasy/lineups/current") {
    response.writeHead(401, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({ ok: false, error: { message: "Faça login pelo Discord." } }));
  }
  const pathname = url.pathname === "/fantasy/" || url.pathname === "/fantasy"
    ? "/fantasy/index.html"
    : url.pathname;
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root) || !fs.existsSync(target)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const type = target.endsWith(".css")
    ? "text/css"
    : target.endsWith(".js") ? "text/javascript"
      : target.endsWith(".json") || target.endsWith(".webmanifest") ? "application/json"
        : target.endsWith(".png") ? "image/png" : "text/html";
  response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  fs.createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Fantasy preview: http://127.0.0.1:${port}/fantasy/`);
});

function json(response, data) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ...data, ok: true, data }));
}
