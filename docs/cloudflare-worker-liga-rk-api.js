export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204 }));
    }

    try {
      await ensureSchema(env);

      if (request.method === "GET" && url.pathname === "/") {
        return json(request, {
          ok: true,
          app: "Liga RK 26.2 API",
          routes: [
            "/health",
            "/api/content",
            "/api/admin/content",
            "/api/registrations",
            "/api/admin/registrations",
            "/api/riot/tournament-callback"
          ]
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json(request, { ok: true, app: "Liga RK 26.2 API" });
      }

      if (request.method === "GET" && url.pathname === "/api/content") {
        const row = await env.DB.prepare(
          "SELECT content, updated_at FROM site_content WHERE key = ?"
        ).bind("content").first();

        return json(request, {
          ok: true,
          content: row ? JSON.parse(row.content) : null,
          updatedAt: row ? row.updated_at : null
        });
      }

      if ((request.method === "PUT" || request.method === "POST") && url.pathname === "/api/admin/content") {
        requireAdmin(request, env);
        const payload = await readJson(request);

        if (!payload.content || !payload.content.divisions) {
          return json(request, { ok: false, error: "Conteudo invalido." }, 400);
        }

        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO site_content (key, content, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
        ).bind("content", JSON.stringify(payload.content), now).run();

        return json(request, { ok: true, updatedAt: now });
      }

      if (request.method === "POST" && url.pathname === "/api/registrations") {
        const payload = await readJson(request);
        const validationError = validateRegistration(payload);

        if (validationError) {
          return json(request, { ok: false, error: validationError }, 400);
        }

        const now = new Date().toISOString();
        const result = await env.DB.prepare(
          `INSERT INTO registrations (
            submitted_at,
            division,
            team_name,
            team_tag,
            captain_index,
            payload
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          now,
          payload.division,
          payload.team.name,
          payload.team.tag,
          Number(payload.captainIndex),
          JSON.stringify(payload)
        ).run();

        return json(request, {
          ok: true,
          id: result.meta && result.meta.last_row_id,
          submittedAt: now
        });
      }

      if (request.method === "GET" && url.pathname === "/api/admin/registrations") {
        requireAdmin(request, env);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 300);
        const rows = await env.DB.prepare(
          `SELECT id, submitted_at, division, team_name, team_tag, captain_index, payload
           FROM registrations
           ORDER BY id DESC
           LIMIT ?`
        ).bind(limit).all();

        return json(request, {
          ok: true,
          registrations: (rows.results || []).map((row) => ({
            id: row.id,
            submittedAt: row.submitted_at,
            division: row.division,
            teamName: row.team_name,
            teamTag: row.team_tag,
            captainIndex: row.captain_index,
            payload: parseJson(row.payload)
          }))
        });
      }

      if (request.method === "POST" && url.pathname === "/api/riot/tournament-callback") {
        const payload = await readJson(request);
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO riot_callbacks (received_at, payload) VALUES (?, ?)"
        ).bind(now, JSON.stringify(payload)).run();

        return json(request, {
          ok: true,
          message: "Callback recebido pela Liga RK 26.2.",
          receivedAt: now
        });
      }

      return json(request, { ok: false, error: "Rota nao encontrada." }, 404);
    } catch (error) {
      const status = error.status || 500;
      return json(request, { ok: false, error: error.message || "Erro interno." }, status);
    }
  }
};

async function ensureSchema(env) {
  if (!env.DB) {
    throw Object.assign(new Error("Binding DB nao configurado no Worker."), { status: 500 });
  }

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS riot_callbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT NOT NULL,
      payload TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitted_at TEXT NOT NULL,
      division TEXT NOT NULL,
      team_name TEXT NOT NULL,
      team_tag TEXT NOT NULL,
      captain_index INTEGER NOT NULL,
      payload TEXT NOT NULL
    )`
  ).run();
}

function requireAdmin(request, env) {
  const expected = String(env.ADMIN_TOKEN || "").trim();
  const received = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

  if (!expected) {
    throw Object.assign(new Error("Configure o segredo ADMIN_TOKEN no Worker."), { status: 500 });
  }
  if (!received || received !== expected) {
    throw Object.assign(new Error("Token de administrador invalido."), { status: 401 });
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

function validateRegistration(payload) {
  if (!payload || typeof payload !== "object") {
    return "Inscrição inválida.";
  }
  if (!["elite", "ascension"].includes(payload.division)) {
    return "Divisão inválida.";
  }
  if (!payload.team || !String(payload.team.name || "").trim()) {
    return "Nome do time obrigatório.";
  }
  if (!/^[A-Z0-9]{2,4}$/.test(String(payload.team.tag || ""))) {
    return "TAG inválida.";
  }
  if (!String(payload.team.logoDataUrl || "").startsWith("data:image/")) {
    return "Logo obrigatória.";
  }

  const players = Array.isArray(payload.players) ? payload.players : [];
  const filledPlayers = players.filter((player) => {
    return player && (player.name || player.riotId || player.discord || player.opgg);
  });
  const completePlayers = players.filter((player) => {
    return player && player.name && player.riotId && player.discord && player.opgg;
  });
  const captain = players[Number(payload.captainIndex)];

  if (filledPlayers.length < 5 || completePlayers.length < filledPlayers.length || completePlayers.length < 5) {
    return "Preencha pelo menos 5 jogadores completos.";
  }
  if (!captain || !captain.name || !captain.riotId || !captain.discord || !captain.opgg) {
    return "Capitão inválido.";
  }
  if (payload.acceptedRules !== true) {
    return "Regulamento não aceito.";
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > 1500000) {
    return "Inscrição muito grande. Reduza a logo e tente novamente.";
  }

  return "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function json(request, body, status = 200) {
  return withCors(request, new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  }));
}

function withCors(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin") || "*";

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
