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
            "/api/admin/check",
            "/api/registrations",
            "/api/admin/registrations",
            "/api/pool-predictions",
            "/api/admin/pool-predictions",
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

      if (request.method === "GET" && url.pathname === "/api/admin/check") {
        requireAdmin(request, env);
        return json(request, { ok: true, message: "Token de administrador validado." });
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

      if (request.method === "POST" && url.pathname === "/api/pool-predictions") {
        const payload = await readJson(request);
        const officialContent = await readOfficialContent(env);
        const validation = validatePoolPrediction(payload, officialContent);

        if (validation.error) {
          return json(request, { ok: false, error: validation.error }, 400);
        }

        const now = new Date().toISOString();

        try {
          const result = await env.DB.prepare(
            `INSERT INTO pool_predictions (
              submitted_at,
              community_nick,
              discord_id,
              discord_key,
              payload
            ) VALUES (?, ?, ?, ?, ?)`
          ).bind(
            now,
            validation.payload.communityNick,
            validation.payload.discordId,
            validation.discordKey,
            JSON.stringify(validation.payload)
          ).run();

          return json(request, {
            ok: true,
            id: result.meta && result.meta.last_row_id,
            submittedAt: now
          });
        } catch (error) {
          if (/unique|constraint/i.test(String(error && error.message || ""))) {
            return json(request, {
              ok: false,
              error: "Este ID do Discord já enviou um palpite. Cada participante pode responder apenas uma vez."
            }, 409);
          }
          throw error;
        }
      }

      if (request.method === "GET" && url.pathname === "/api/admin/pool-predictions") {
        requireAdmin(request, env);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 500, 1), 1000);
        const rows = await env.DB.prepare(
          `SELECT id, submitted_at, community_nick, discord_id, payload
           FROM pool_predictions
           ORDER BY id DESC
           LIMIT ?`
        ).bind(limit).all();

        return json(request, {
          ok: true,
          predictions: (rows.results || []).map((row) => ({
            id: row.id,
            submittedAt: row.submitted_at,
            communityNick: row.community_nick,
            discordId: row.discord_id,
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

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS pool_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitted_at TEXT NOT NULL,
      community_nick TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      discord_key TEXT NOT NULL UNIQUE,
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

async function readOfficialContent(env) {
  const row = await env.DB.prepare(
    "SELECT content FROM site_content WHERE key = ?"
  ).bind("content").first();

  if (!row || !row.content) {
    throw Object.assign(new Error("O conteúdo oficial ainda não foi publicado."), { status: 503 });
  }

  return parseJson(row.content) || {};
}

function validatePoolPrediction(payload, content) {
  const communityNick = String(payload && payload.communityNick || "").trim();
  const discordId = String(payload && payload.discordId || "").trim();
  const discordKey = discordId.replace(/^@+/, "").trim().toLocaleLowerCase("pt-BR");
  const choices = payload && payload.choices || {};
  const championChoices = choices.champions || {};
  const divisionChoices = choices.divisions || {};

  if (communityNick.length < 2 || communityNick.length > 40) {
    return { error: "Informe seu nick na comunidade." };
  }
  if (!/^[^\s@][^\s]{1,63}$/.test(discordKey)) {
    return { error: "Informe um ID do Discord válido, sem espaços." };
  }

  const mostPicked = normalizeChampionChoice(championChoices.mostPicked);
  const mostWins = normalizeChampionChoice(championChoices.mostWins);
  if (!mostPicked || !mostWins) {
    return { error: "Escolha os dois campeões do palpite." };
  }

  const normalizedDivisions = {};
  for (const divisionKey of ["elite", "ascension"]) {
    const officialDivision = content && content.divisions && content.divisions[divisionKey];
    const submittedDivision = divisionChoices[divisionKey] || {};
    const available = poolOptionsForDivision(officialDivision);

    if (!officialDivision) {
      return { error: `A divisão ${divisionKey} não está disponível.` };
    }

    const teamChampion = available.teams.get(String(submittedDivision.teamChampion || ""));
    if (!teamChampion) {
      return { error: `Escolha a equipe campeã da ${divisionKey === "elite" ? "Elite" : "Ascensão"}.` };
    }

    const normalizedPlayers = {};
    for (const field of ["mvp", "bestKda", "highestDpm", "highestGpm", "highestKp", "highestVision"]) {
      const selected = available.players.get(String(submittedDivision[field] || ""));
      if (!selected) {
        return { error: `Complete todos os palpites de jogadores da ${divisionKey === "elite" ? "Elite" : "Ascensão"}.` };
      }
      normalizedPlayers[field] = selected;
    }

    normalizedDivisions[divisionKey] = {
      teamChampion,
      ...normalizedPlayers
    };
  }

  return {
    error: "",
    discordKey,
    payload: {
      version: 1,
      communityNick,
      discordId: discordId.startsWith("@") ? discordId : `@${discordId}`,
      choices: {
        champions: {
          mostPicked,
          mostWins
        },
        divisions: normalizedDivisions
      }
    }
  };
}

function normalizeChampionChoice(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9]{1,31}$/.test(id)) {
    return null;
  }
  return { id, label: championDisplayName(id), image: `assets/champions/${id}.jpg` };
}

function championDisplayName(id) {
  const special = {
    AurelionSol: "Aurelion Sol",
    Belveth: "Bel'Veth",
    Chogath: "Cho'Gath",
    DrMundo: "Dr. Mundo",
    JarvanIV: "Jarvan IV",
    Kaisa: "Kai'Sa",
    Khazix: "Kha'Zix",
    KogMaw: "Kog'Maw",
    KSante: "K'Sante",
    Leblanc: "LeBlanc",
    LeeSin: "Lee Sin",
    MasterYi: "Master Yi",
    MissFortune: "Miss Fortune",
    MonkeyKing: "Wukong",
    RekSai: "Rek'Sai",
    TahmKench: "Tahm Kench",
    TwistedFate: "Twisted Fate",
    XinZhao: "Xin Zhao"
  };
  return special[id] || id.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function poolOptionsForDivision(division) {
  const teams = new Map();
  const players = new Map();

  Object.entries(division && division.teams || {}).forEach(([slot, team]) => {
    const name = String(team && team.name || "").trim();
    const tag = String(team && team.tag || slot).trim().toUpperCase();
    if (!name || /vaga disponível|nome do time/i.test(name)) {
      return;
    }

    teams.set(slot, {
      id: slot,
      slot,
      name,
      tag,
      label: `${name} (${tag})`,
      logo: String(team.logo || "")
    });

    (team.players || []).forEach((player, index) => {
      const playerName = String(player && (player.player || player.name) || "").trim();
      if (!playerName || /^(?:jogador|player|-|--|sub)$/i.test(playerName)) {
        return;
      }
      const id = String(player.playerId || `${slot}:${index}`);
      players.set(id, {
        id,
        player: playerName,
        label: `${playerName} (${tag})`,
        lane: String(player.lane || "SUB").toUpperCase(),
        teamName: name,
        teamTag: tag,
        teamSlot: slot,
        teamLogo: String(team.logo || "")
      });
    });
  });

  return { teams, players };
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
