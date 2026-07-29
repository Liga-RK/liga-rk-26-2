import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local visual QA helper; it is intentionally kept outside the test discovery tree.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const port = Number(process.argv[2] || 8767);

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/fantasy/admin/auth/session") {
    return json(response, {
      authenticated: true,
      username: "admin-rk",
      csrfToken: "preview",
      expiresAt: "2026-07-30T12:00:00.000Z"
    });
  }
  if (url.pathname === "/api/fantasy/admin/overview") {
    return json(response, {
      market: {
        status: "closed",
        roundNumber: 2,
        closesAt: "2026-08-01T18:35:00.000Z",
        lockMatchId: "schedule:ascension:r2g1"
      },
      schedule: { warnings: [], matches: [] },
      counts: {
        users: 11,
        fantasyTeams: 0,
        lineups: 0,
        marketAssets: 192,
        officialPlayers: 256,
        officialTeams: 32,
        matches: 48,
        rounds: 6,
        imports: 2,
        errors: 0,
        backups: 3
      },
      latest: {},
      timezone: "America/Sao_Paulo"
    });
  }
  if (url.pathname === "/api/fantasy/admin/scores") {
    return json(response, {
      scores: [{
        roundId: "elite-r1",
        roundNumber: 1,
        division: "elite",
        assetId: "player:elite:a1:top",
        role: "TOP",
        games: 2,
        points: 82.45
      }]
    });
  }
  if (url.pathname === "/api/fantasy/admin/formula") {
    return json(response, {
      formula: {
        version: "rk-value-v2",
        settings: {
          roundWeight: 0.55,
          averageWeight: 0.25,
          recentWeight: 0.20,
          expectationBase: 3,
          expectationPerPrice: 0.62,
          volatility: 0.34,
          damping: 0.85,
          minimumPrice: 4,
          minimumGames: 3,
          decimals: 2,
          didNotPlay: "hold"
        }
      }
    });
  }
  if (url.pathname === "/api/fantasy/admin/valuation/history") {
    return json(response, { simulations: [] });
  }
  if (url.pathname === "/api/fantasy/admin/lineups") {
    return json(response, {
      lineups: [{
        id: "lineup-preview",
        division: "elite",
        roundNumber: 1,
        username: "Vitor",
        fantasyTeamName: "RK Preview",
        totalCost: 96.75,
        captainAssetId: "player:elite:a1:mid",
        picks: [
          ["TOP", "player:elite:a1:top"],
          ["JG", "player:elite:a2:jg"],
          ["MID", "player:elite:a1:mid"],
          ["ADC", "player:elite:a3:adc"],
          ["SUP", "player:elite:a4:sup"],
          ["TEAM", "team:elite:A1"]
        ].map(([role, assetId]) => ({ role, assetId, teamSlot: role === "TEAM" ? "A1" : role })),
        reserve: { role: "TOP", assetId: "player:elite:a5:top", teamSlot: "A5" },
        validationIssues: [],
        updatedAt: "2026-07-29T18:30:00.000Z"
      }]
    });
  }
  if (url.pathname === "/api/fantasy/admin/backups") {
    return json(response, {
      backups: [{
        id: "5b17c154-5b11-4fd8-bb60-76f58bf8f78e",
        createdAt: "2026-07-29T18:30:00.000Z",
        reason: "Backup automático antes da sincronização",
        schemaVersion: "5",
        bytes: 246810,
        dataHash: "0123456789abcdef0123456789abcdef"
      }]
    });
  }
  if (url.pathname === "/api/fantasy/admin/audit") {
    return json(response, { audit: [] });
  }
  if (url.pathname === "/api/fantasy/admin/errors") {
    return json(response, { errors: [] });
  }
  const pathname = request.url === "/admin/" || request.url === "/admin"
    ? "/admin/index.html"
    : request.url.split("?")[0];
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root) || !fs.existsSync(target)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const type = target.endsWith(".css")
    ? "text/css"
    : target.endsWith(".js") ? "text/javascript" : "text/html";
  response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  fs.createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Admin preview: http://127.0.0.1:${port}/admin/`);
});

function json(response, data) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: true, data }));
}
