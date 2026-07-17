(function () {
  const root = document.getElementById("statistics-app");
  const payload = window.LIGA_RK_STATS || { divisions: {} };
  const params = new URLSearchParams(window.location.search);
  const page = document.body.dataset.statisticsPage || "hub";
  const requestedDivision = normalizeDivision(params.get("division"));
  const requestedId = String(params.get("id") || "").trim();
  const socialLinks = [
    ["Discord", "https://discord.gg/m9C7dbQUSV", "discord.svg"],
    ["WhatsApp", "https://chat.whatsapp.com/JvqkNB8e9KyK8I8adHoKZq", "whatsapp.svg"],
    ["Kick", "https://kick.com/rk-inhouse", "kick.svg"],
    ["YouTube", "https://www.youtube.com/@rk-inhouse", "youtube.svg"],
    ["Instagram", "https://www.instagram.com/inhouserk/", "instagram.svg"],
    ["TikTok", "https://www.tiktok.com/@inhouse_rk", "tiktok.svg"]
  ];
  const laneOrder = ["TOP", "JG", "MID", "ADC", "SUP"];

  if (!root) return;

  const context = resolveContext(page, requestedDivision, requestedId);
  applyDivisionTheme(context.division);
  render(context);

  function render(current) {
    const division = current.division;
    root.innerHTML = `
      ${renderHeader(division)}
      <main class="stats-public-page">
        ${page === "hub" ? renderHub(division) : ""}
        ${page === "match" ? renderMatchPage(current) : ""}
        ${page === "player" ? renderPlayerPage(current) : ""}
        ${page === "team" ? renderTeamPage(current) : ""}
      </main>
      ${renderFooter()}
    `;
    setupFilters();
  }

  function renderHeader(division) {
    return `
      <header class="site-header stats-public-header">
        <a class="brand" href="index.html" aria-label="Voltar ao in&iacute;cio">
          <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="" />
          <span>LIGA RK 26.2</span>
        </a>
        <div class="header-actions">
          <div class="social-links stats-public-socials">${socialLinks.map(([label, url, icon]) => `
            <a href="${attribute(url)}" target="_blank" rel="noreferrer" aria-label="${attribute(label)}">
              <img src="assets/social/${attribute(icon)}" alt="" />
            </a>`).join("")}
          </div>
          <nav class="division-nav" aria-label="Divis&otilde;es">
            <a class="${division === "elite" ? "active" : ""}" href="estatisticas.html?division=elite">Elite</a>
            <a class="${division === "ascension" ? "active" : ""}" href="estatisticas.html?division=ascension">Ascens&atilde;o</a>
          </nav>
        </div>
      </header>
    `;
  }

  function renderHub(division) {
    const data = divisionData(division);
    const label = divisionLabel(division);
    const overview = data.overview || {};
    const teams = data.teams || [];
    const players = (data.players || []).slice().sort((left, right) => (
      numeric(right.kda) - numeric(left.kda) ||
      numeric(right.games) - numeric(left.games) ||
      numeric(right.winRate) - numeric(left.winRate) ||
      String(left.displayName || "").localeCompare(String(right.displayName || ""), "pt-BR")
    ));
    const champions = data.champions || [];
    const matches = data.matches || [];

    return `
      ${hero("CENTRAL DE ESTAT&Iacute;STICAS", label, "Resultados processados diretamente dos replays oficiais da Liga RK 26.2.")}
      ${!data.hasData ? emptyState("As estat&iacute;sticas desta divis&atilde;o aparecer&atilde;o aqui assim que a primeira partida for processada e confirmada pela organiza&ccedil;&atilde;o.") : `
        <section class="stats-overview" aria-label="Vis&atilde;o geral">
          ${metric("Partidas", overview.games)}
          ${metric("Equipes", overview.teams)}
          ${metric("Jogadores", overview.players)}
          ${metric("Campe&otilde;es", overview.champions)}
        </section>

        <section class="stats-data-section" id="times">
          ${sectionTitle("RANKING DE EQUIPES", `${teams.filter((team) => team.games > 0).length} equipes com partidas`)}
          <div class="stats-table-scroll">${teamTable(teams.filter((team) => team.games > 0), division)}</div>
        </section>

        <section class="stats-data-section" id="jogadores">
          ${sectionTitle("RANKING DE JOGADORES", "Busque por jogador, posi&ccedil;&atilde;o ou equipe")}
          ${playerFilters(players, division)}
          <div class="stats-table-scroll">${playerTable(players, division)}</div>
          <p class="stats-filter-empty" data-player-empty hidden>Nenhum jogador corresponde aos filtros.</p>
        </section>

        <section class="stats-data-section" id="campeoes">
          ${sectionTitle("CAMPE&Otilde;ES", "Escolhas, vit&oacute;rias e desempenho")}
          <div class="stats-champion-grid">${champions.slice(0, 24).map(championCard).join("")}</div>
        </section>

        <section class="stats-data-section" id="partidas">
          ${sectionTitle("PARTIDAS", "Hist&oacute;rico processado")}
          ${matchFilters(matches)}
          <div class="stats-match-list">${matches.map((match) => matchCard(match, division)).join("")}</div>
          <p class="stats-filter-empty" data-match-empty hidden>Nenhuma partida corresponde aos filtros.</p>
        </section>
      `}
    `;
  }

  function renderMatchPage(context) {
    const match = context.item;
    const division = context.division;
    if (!match) return notFound("Partida n&atilde;o encontrada", division);
    const blue = match.teams && match.teams["100"] || {};
    const red = match.teams && match.teams["200"] || {};
    const participants = match.participants || [];
    const bluePlayers = sortParticipants(participants.filter((player) => Number(player.team) === 100));
    const redPlayers = sortParticipants(participants.filter((player) => Number(player.team) === 200));
    const maxDamage = Math.max(1, ...participants.map((player) => numeric(player.damageToChampions)));
    const blueWon = match.winnerSlot === match.blueTeamSlot;
    const redWon = match.winnerSlot === match.redTeamSlot;
    return `
      ${detailBack(division)}
      <section class="stats-postgame-card" aria-label="Resumo da partida entre ${attribute(teamShortName(match.blueTeam, match.blueTeamSlot))} e ${attribute(teamShortName(match.redTeam, match.redTeamSlot))}">
        <header class="stats-postgame-header">
          ${postgameTeamLogo(match.blueTeam, division)}
          <div class="stats-postgame-heading">
            <span>${text(match.stage || "PARTIDA")} &middot; ${text(match.round || match.seriesId || "LIGA RK 26.2")} &middot; JOGO ${text(match.gameNumber || "-")}</span>
            <h1>${text(teamShortName(match.blueTeam, match.blueTeamSlot))}<b>&times;</b>${text(teamShortName(match.redTeam, match.redTeamSlot))}</h1>
            <div class="stats-postgame-result">
              <strong class="${blueWon ? "winner" : "loser"}">${blueWon ? "VIT&Oacute;RIA" : "DERROTA"}</strong>
              <time datetime="PT${Math.max(0, numeric(match.durationSeconds))}S">${text(match.duration || "00:00")}</time>
              <strong class="${redWon ? "winner" : "loser"}">${redWon ? "VIT&Oacute;RIA" : "DERROTA"}</strong>
            </div>
          </div>
          ${postgameTeamLogo(match.redTeam, division)}
        </header>
        <div class="stats-postgame-body">
          <div class="stats-postgame-roster blue-side">
            ${bluePlayers.map((player) => postgamePlayer(player, maxDamage, division, match.mvp, "blue")).join("")}
          </div>
          <div class="stats-postgame-scoreboard" aria-label="Comparativo das equipes">
            ${postgameMetric("PLACAR", blue.kills, red.kills)}
            ${postgameMetric("OURO", formatCompactNumber(blue.gold), formatCompactNumber(red.gold))}
            ${postgameMetric("TORRES", blue.towers, red.towers)}
            ${postgameMetric("LARVAS", blue.voidGrubs, red.voidGrubs)}
            ${postgameMetric("ARAUTO", blue.heralds, red.heralds)}
            ${postgameMetric("DRAG&Otilde;ES", blue.dragons, red.dragons)}
            ${postgameMetric("ELDERS", blue.elderDragons, red.elderDragons)}
            ${postgameMetric("BAR&Otilde;ES", blue.barons, red.barons)}
          </div>
          <div class="stats-postgame-roster red-side">
            ${redPlayers.map((player) => postgamePlayer(player, maxDamage, division, match.mvp, "red")).join("")}
          </div>
        </div>
      </section>
    `;
  }

  function renderPlayerPage(context) {
    const player = context.item;
    const division = context.division;
    const data = divisionData(division);
    if (!player) return notFound("Jogador n&atilde;o encontrado", division);
    const teams = (player.teams || []).map((entry) => data.teams.find((team) => team.slot === entry.slot)).filter(Boolean);
    const primary = teams[0] || null;
    const opgg = safeExternalUrl(player.opgg);
    return `
      ${detailBack(division)}
      <section class="stats-player-dashboard" aria-label="Painel individual de ${attribute(player.displayName || player.riotId || "jogador")}">
        <div class="stats-player-profile-column">
          <article class="stats-player-identity-panel">
            <div class="stats-player-profile-logo">${teamLogo(primary)}</div>
            <div class="stats-player-profile-name">
              <h1>${text(player.displayName || player.riotId || "JOGADOR")}</h1>
              <p>${text(player.riotId || "Riot ID n&atilde;o informado")}</p>
            </div>
            <div class="stats-player-profile-lane">${profileLaneIcon(player.mainPosition)}</div>
          </article>
          ${opgg
            ? `<a class="stats-player-opgg" href="${attribute(opgg)}" target="_blank" rel="noreferrer">OP.GG</a>`
            : `<span class="stats-player-opgg disabled" aria-disabled="true">OP.GG</span>`}
        </div>
        <div class="stats-player-dashboard-content">
          <section class="stats-player-dashboard-metrics" aria-label="Indicadores do jogador">
            ${playerProfileMetric("KDA", formatDecimal(player.kda))}
            ${playerProfileMetric("DPM", formatDecimal(player.dpm))}
            ${playerProfileMetric("KP", `${formatDecimal(player.kp)}%`)}
            ${playerProfileMetric("MVP", player.mvps)}
            ${playerProfileMetric("GPM", formatDecimal(player.gpm))}
            ${playerProfileMetric("VIS", formatDecimal(player.visionScoreAvg))}
          </section>
          <section class="stats-player-champions" aria-label="Campe&otilde;es utilizados">
            ${(player.champions || []).map((entry) => playerChampionCard(entry, data)).join("") || emptyInline("Nenhum campe&atilde;o registrado.")}
          </section>
        </div>
      </section>
    `;
  }

  function renderTeamPage(context) {
    const team = context.item;
    const division = context.division;
    const data = divisionData(division);
    if (!team) return notFound("Equipe n&atilde;o encontrada", division);
    const players = (data.players || []).filter((player) => (player.teams || []).some((entry) => entry.slot === team.slot));
    const champions = (data.champions || []).filter((champion) => (champion.teams || []).includes(team.slot));
    const matches = (data.matches || []).filter((match) => match.blueTeamSlot === team.slot || match.redTeamSlot === team.slot);
    const group = teamGroupContext(data, team);
    const teamStanding = group.entries.find((entry) => entry.slot === team.slot) || emptyGroupEntry(team);
    return `
      ${detailBack(division)}
      <section class="stats-team-hero">
        ${teamLogo(team)}
        <div>
          <span>${divisionLabel(division)}</span>
          <h1>${text(team.name || team.slot)}</h1>
          <p>${text(team.tag || team.slot)} - ${group.position}&ordm; GRUPO ${text(group.letter)} - ${teamStanding.wins}-${teamStanding.losses}</p>
        </div>
      </section>
      <section class="stats-team-competition" aria-label="Desempenho competitivo e classifica&ccedil;&atilde;o do grupo">
        <div class="stats-team-dashboard-metrics">
          ${teamDashboardMetric("SJ", signedNumber(teamStanding.gameDiff))}
          ${teamDashboardMetric("TMV", teamStanding.avgWinTime || "00:00")}
          ${teamDashboardMetric("%WR", `${formatDecimal(teamStanding.winRate)}%`)}
          ${teamDashboardMetric("KDA", formatDecimal(team.kda))}
          ${teamDashboardMetric("GPM", formatDecimal(team.gpmAvg))}
          ${teamDashboardMetric("DPM", formatDecimal(teamDamagePerMinute(team)))}
        </div>
        ${teamGroupTable(group, division)}
      </section>
      <section class="stats-data-section">
        ${sectionTitle("JOGADORES UTILIZADOS", `${players.length} jogadores identificados`)}
        <div class="stats-table-scroll">${playerTable(players, division)}</div>
      </section>
      <section class="stats-data-section">
        ${sectionTitle("CAMPE&Otilde;ES", "Escolhas da equipe")}
        <div class="stats-champion-grid">${champions.slice(0, 16).map(championCard).join("") || emptyInline("Nenhum campe&atilde;o registrado.")}</div>
      </section>
      <section class="stats-data-section">
        ${sectionTitle("PARTIDAS", "Hist&oacute;rico da equipe")}
        <div class="stats-match-list">${matches.map((match) => matchCard(match, division)).join("") || emptyInline("Nenhuma partida encontrada.")}</div>
      </section>
    `;
  }

  function teamGroupContext(data, team) {
    const letter = String(team.slot || "A").charAt(0).toUpperCase();
    const teams = (data.teams || []).filter((entry) => String(entry.slot || "").charAt(0).toUpperCase() === letter);
    const entriesBySlot = Object.fromEntries(teams.map((entry, fallbackSeed) => [entry.slot, {
      slot: entry.slot,
      seed: slotSeed(entry.slot, fallbackSeed),
      team: entry,
      wins: 0,
      losses: 0,
      gameDiff: 0,
      games: 0,
      winDurationSeconds: 0,
      winDurationCount: 0,
      avgWinTime: "00:00",
      winRate: 0
    }]));
    const series = new Map();

    (data.matches || []).filter(isGroupMatch).forEach((match) => {
      const slots = [match.blueTeamSlot, match.redTeamSlot].filter((slot) => entriesBySlot[slot]);
      if (slots.length !== 2) return;
      const key = match.seriesId || `${slots.slice().sort().join("-")}-${match.round || ""}`;
      const current = series.get(key) || { slots: Array.from(new Set(slots)), scores: {} };
      current.slots = Array.from(new Set([...current.slots, ...slots]));
      current.scores[match.winnerSlot] = Math.min(2, numeric(current.scores[match.winnerSlot]) + 1);
      series.set(key, current);

      const winner = entriesBySlot[match.winnerSlot];
      if (winner && numeric(match.durationSeconds) > 0) {
        winner.winDurationSeconds += numeric(match.durationSeconds);
        winner.winDurationCount += 1;
      }
    });

    series.forEach((current) => {
      const [slotA, slotB] = current.slots;
      const scoreA = numeric(current.scores[slotA]);
      const scoreB = numeric(current.scores[slotB]);
      if (!entriesBySlot[slotA] || !entriesBySlot[slotB] || Math.max(scoreA, scoreB) < 2 || scoreA === scoreB) return;
      const entryA = entriesBySlot[slotA];
      const entryB = entriesBySlot[slotB];
      entryA.games += 1;
      entryB.games += 1;
      entryA.gameDiff += scoreA - scoreB;
      entryB.gameDiff += scoreB - scoreA;
      if (scoreA > scoreB) {
        entryA.wins += 1;
        entryB.losses += 1;
      } else {
        entryB.wins += 1;
        entryA.losses += 1;
      }
    });

    const entries = Object.values(entriesBySlot);
    entries.forEach((entry) => {
      entry.avgWinTime = entry.winDurationCount ? formatSeconds(entry.winDurationSeconds / entry.winDurationCount) : (entry.team.avgWinTime || "00:00");
      entry.winRate = entry.games ? entry.wins / entry.games * 100 : 0;
    });
    entries.sort((left, right) => (
      right.wins - left.wins ||
      left.losses - right.losses ||
      right.gameDiff - left.gameDiff ||
      timeToSeconds(left.avgWinTime) - timeToSeconds(right.avgWinTime) ||
      left.seed - right.seed
    ));
    return { letter, entries, position: Math.max(1, entries.findIndex((entry) => entry.slot === team.slot) + 1) };
  }

  function emptyGroupEntry(team) {
    return { slot: team.slot, team, wins: 0, losses: 0, gameDiff: 0, games: 0, avgWinTime: "00:00", winRate: 0 };
  }

  function teamGroupTable(group, division) {
    return `
      <aside class="stats-team-group-card">
        <header><strong>GRUPO ${text(group.letter)}</strong><span>V</span><span>D</span><span>SJ</span><span>J</span><span>TMV</span></header>
        <div>${group.entries.map((entry, index) => `
          <a class="${index + 1 === group.position ? "current" : ""}" href="time.html?division=${division}&id=${encodeURIComponent(entry.slot)}">
            <b>${index + 1}</b>
            ${teamLogo(entry.team)}
            <strong>${text(entry.team.tag || entry.slot)}</strong>
            <span>${entry.wins}</span>
            <span>${entry.losses}</span>
            <span>${signedNumber(entry.gameDiff)}</span>
            <span>${entry.games}</span>
            <span>${text(entry.avgWinTime)}</span>
          </a>`).join("")}</div>
      </aside>
    `;
  }

  function teamDashboardMetric(label, value) {
    return `<article class="stats-team-dashboard-metric"><span>${label}</span><strong>${value ?? 0}</strong></article>`;
  }

  function isGroupMatch(match) {
    return String(match && match.stage || "").toLowerCase().includes("grupo") || String(match && match.seriesId || "").startsWith("groups-");
  }

  function signedNumber(value) {
    const number = numeric(value);
    return number > 0 ? `+${number}` : String(number);
  }

  function formatSeconds(value) {
    const seconds = Math.max(0, Math.round(numeric(value)));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function timeToSeconds(value) {
    const match = /^(\d{1,3}):([0-5]\d)$/.exec(String(value || "99:59"));
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  function slotSeed(slot, fallback) {
    const seed = Number(String(slot || "").slice(1));
    return Number.isInteger(seed) && seed > 0 ? seed - 1 : fallback;
  }

  function teamDamagePerMinute(team) {
    const stored = Number(team && team.dpmAvg);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const duration = timeToSeconds(team && team.avgDuration);
    if (!Number.isFinite(duration) || duration <= 0 || duration === Number.MAX_SAFE_INTEGER) return 0;
    return numeric(team && team.damageAvg) / duration * 60;
  }

  function teamTable(teams, division) {
    return `<table class="stats-table"><thead><tr><th>#</th><th>Equipe</th><th>J</th><th>V</th><th>D</th><th>V%</th><th>KDA</th><th>GPM</th><th>TMV</th></tr></thead><tbody>${teams.map((team, index) => `
      <tr><td>${index + 1}</td><td>${teamLink(team, division)}</td><td>${team.games}</td><td>${team.wins}</td><td>${team.losses}</td><td>${formatDecimal(team.winRate)}%</td><td>${formatDecimal(team.kda)}</td><td>${formatDecimal(team.gpmAvg)}</td><td>${text(team.avgWinTime)}</td></tr>`).join("")}</tbody></table>`;
  }

  function playerTable(players, division) {
    return `<table class="stats-table stats-player-table"><thead><tr><th>Jogador</th><th>Posi&ccedil;&atilde;o</th><th>KDA</th><th>J</th><th>V%</th><th>KP</th><th>DPM</th><th>GPM</th><th>VS</th><th>MVP</th></tr></thead><tbody>${players.map((player) => {
      const team = primaryTeam(player, division);
      const teamTag = team && (team.tag || team.slot) || "SEM EQUIPE";
      return `
      <tr data-player-row data-search="${attribute(`${player.displayName} ${player.riotId} ${teamTag}`.toLowerCase())}" data-lane="${attribute(player.mainPosition || "")}" data-team="${attribute((player.teams && player.teams[0] && player.teams[0].slot) || "")}">
        <td><div class="stats-player-identity">${teamLogo(team)}<a class="stats-entity-link" href="jogador.html?division=${division}&id=${encodeURIComponent(player.id)}"><strong>${text(player.displayName)}</strong><small>${text(teamTag)}</small></a></div></td>
        <td><span class="stats-lane-cell">${laneIcon(player.mainPosition)}</span></td><td class="stats-kda-cell">${formatDecimal(player.kda)}</td><td>${player.games}</td><td>${formatDecimal(player.winRate)}%</td><td>${formatDecimal(player.kp)}%</td><td>${formatDecimal(player.dpm)}</td><td>${formatDecimal(player.gpm)}</td><td>${formatDecimal(player.visionScoreAvg)}</td><td>${player.mvps}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
  }

  function championCard(champion) {
    return `<article class="stats-champion-card">
      <div class="stats-champion-art">${safeImageUrl(champion.image) ? `<img src="${attribute(safeImageUrl(champion.image))}" alt="${attribute(champion.name)}" loading="lazy" />` : ""}</div>
      <div><strong>${text(champion.name)}</strong><span>${champion.picks} escolhas &middot; ${champion.wins} vit&oacute;rias</span><small>${formatDecimal(champion.winRate)}% &middot; ${formatDecimal(champion.kda)} KDA</small></div>
    </article>`;
  }

  function playerChampionCard(entry, data) {
    const champion = (data.champions || []).find((item) => normalizeChampionKey(item.name) === normalizeChampionKey(entry.champion)) || {};
    const image = safeImageUrl(entry.image || champion.image);
    const games = numeric(entry.count);
    const wins = numeric(entry.wins);
    const winRate = Number.isFinite(Number(entry.winRate)) ? Number(entry.winRate) : games ? wins / games * 100 : 0;
    return `<article class="stats-player-champion-card">
      <div class="stats-player-champion-art">${image ? `<img src="${attribute(image)}" alt="${attribute(entry.champion)}" loading="lazy" />` : ""}</div>
      <div><strong>${text(entry.champion)}</strong><span>${games} ${games === 1 ? "partida" : "partidas"}</span><b>${formatDecimal(winRate)}% WR</b></div>
    </article>`;
  }

  function playerProfileMetric(label, value) {
    return `<article class="stats-player-dashboard-metric"><span>${label}</span><strong>${value ?? 0}</strong></article>`;
  }

  function matchCard(match, division) {
    const blueWon = match.winnerSlot === match.blueTeamSlot;
    const redWon = match.winnerSlot === match.redTeamSlot;
    const stage = `${match.stage || ""} ${match.round || ""} ${match.seriesId || ""}`.trim();
    return `<article class="stats-match-row" data-match-row data-search="${attribute(`${stage} ${match.blueTeam && match.blueTeam.name} ${match.redTeam && match.redTeam.name}`.toLowerCase())}" data-stage="${attribute(match.stage || "")}">
      <div class="stats-match-meta"><strong>${text(match.stage || "PARTIDA")}</strong><span>${text(match.round || match.seriesId || "")}</span><small>${text(match.duration || "00:00")}</small></div>
      <div class="stats-match-team ${blueWon ? "winner" : ""}">${teamLogo(match.blueTeam)}<span>${text(match.blueTeam && (match.blueTeam.tag || match.blueTeam.name))}</span><strong>${text(match.teams && match.teams["100"] && match.teams["100"].kills || 0)}</strong></div>
      <span class="stats-match-x">&times;</span>
      <div class="stats-match-team ${redWon ? "winner" : ""}">${teamLogo(match.redTeam)}<span>${text(match.redTeam && (match.redTeam.tag || match.redTeam.name))}</span><strong>${text(match.teams && match.teams["200"] && match.teams["200"].kills || 0)}</strong></div>
      <a class="stats-command-link" href="partida.html?division=${division}&id=${encodeURIComponent(match.id)}">Ver partida</a>
    </article>`;
  }

  function postgameTeamLogo(team, division) {
    const slot = team && team.slot || "";
    const logo = safeImageUrl(team && team.logo) || "assets/logo_rk_placeholder.png";
    const image = `<img src="${attribute(logo)}" alt="${attribute(teamShortName(team, slot))}" />`;
    return slot
      ? `<a class="stats-postgame-team-logo" href="time.html?division=${division}&id=${encodeURIComponent(slot)}" aria-label="Ver equipe ${attribute(teamShortName(team, slot))}">${image}</a>`
      : `<span class="stats-postgame-team-logo">${image}</span>`;
  }

  function postgamePlayer(player, maxDamage, division, mvp, side) {
    const publicPlayer = participantPublicPlayer(player, division);
    const playerId = publicPlayer && publicPlayer.id || "";
    const displayName = publicPlayer && publicPlayer.displayName || player.gameName || String(player.riotId || "").split("#")[0] || "JOGADOR";
    const isMvp = mvp && Number(mvp.participantIndex) === Number(player.participantIndex);
    const damage = numeric(player.damageToChampions);
    const width = Math.max(2, Math.min(100, damage / Math.max(1, maxDamage) * 100));
    const identity = playerId
      ? `<a href="jogador.html?division=${division}&id=${encodeURIComponent(playerId)}">${text(displayName)}</a>`
      : `<strong>${text(displayName)}</strong>`;
    return `<article class="stats-postgame-player ${side}-player">
      <span class="stats-postgame-lane">${laneIcon(player.position)}</span>
      <div class="stats-postgame-player-name">${identity}<small>${text(player.champion || "-")}${isMvp ? " &middot; MVP" : ""}</small></div>
      <div class="stats-postgame-performance">
        <div><b>${formatCompactNumber(damage)}</b><strong>${numeric(player.kills)}/${numeric(player.deaths)}/${numeric(player.assists)}</strong></div>
        <span class="stats-postgame-damage"><i style="width:${width}%"></i></span>
      </div>
    </article>`;
  }

  function postgameMetric(label, blueValue, redValue) {
    return `<div class="stats-postgame-metric"><strong>${text(blueValue ?? 0)}</strong><span>${label}</span><strong>${text(redValue ?? 0)}</strong></div>`;
  }

  function sortParticipants(players) {
    return players.slice().sort((left, right) => laneIndex(left.position) - laneIndex(right.position) || numeric(left.participantIndex) - numeric(right.participantIndex));
  }

  function laneIndex(value) {
    const index = laneOrder.indexOf(normalizeLane(value));
    return index === -1 ? laneOrder.length : index;
  }

  function laneIcon(value) {
    const lane = normalizeLane(value);
    if (!laneOrder.includes(lane)) return `<span class="stats-lane-missing" aria-label="Posi&ccedil;&atilde;o n&atilde;o informada">-</span>`;
    return `<img class="stats-lane-icon" src="assets/lane-icons/${lane.toLowerCase()}-white.png" alt="${attribute(lane)}" title="${attribute(lane)}" loading="lazy" />`;
  }

  function profileLaneIcon(value) {
    const lane = normalizeLane(value);
    if (!laneOrder.includes(lane)) return `<span class="stats-player-profile-lane-missing" aria-label="Posi&ccedil;&atilde;o n&atilde;o informada">-</span>`;
    return `<img src="assets/player-lane-icons/${lane.toLowerCase()}.png" alt="${attribute(lane)}" title="${attribute(lane)}" decoding="async" />`;
  }

  function normalizeLane(value) {
    const lane = String(value || "").trim().toUpperCase();
    if (lane === "JUNGLE") return "JG";
    if (lane === "MIDDLE") return "MID";
    if (lane === "BOTTOM" || lane === "BOT") return "ADC";
    if (lane === "UTILITY" || lane === "SUPPORT") return "SUP";
    return lane;
  }

  function participantPublicPlayer(participant, division) {
    const players = divisionData(division).players || [];
    const direct = players.find((entry) => entry.id === participant.playerId || entry.playerId === participant.playerId);
    if (direct) return direct;
    const identity = normalizeIdentity(participant.riotId || `${participant.gameName || ""}#${participant.tagLine || ""}`);
    return players.find((entry) => {
      const identities = [entry.riotId, ...(entry.alsoPlayedAs || [])].map(normalizeIdentity);
      return identity && identities.includes(identity);
    }) || null;
  }

  function teamShortName(team, fallback) {
    return String(team && (team.tag || team.name || team.slot) || fallback || "EQUIPE").toUpperCase();
  }

  function participantSide(title, players, maxDamage, division, mvp) {
    return `<div class="stats-participant-side"><h3>${title}</h3>${players.map((player) => {
      const playerId = player.playerId || "";
      const isMvp = mvp && Number(mvp.participantIndex) === Number(player.participantIndex);
      return `<article class="stats-participant-row">
        <div class="stats-participant-name"><span>${laneIcon(player.position)}</span><div>${playerId ? `<a href="jogador.html?division=${division}&id=${encodeURIComponent(playerId)}">${text(player.gameName || player.riotId)}</a>` : `<strong>${text(player.gameName || player.riotId)}</strong>`}<small>${text(player.champion)}${isMvp ? " &middot; MVP" : ""}</small></div></div>
        <div class="stats-participant-kda"><span>K / D / A</span><strong>${player.kills}/${player.deaths}/${player.assists}</strong></div>
        <div class="stats-participant-gold"><span>OURO</span><strong>${formatNumber(player.gold)}</strong></div>
        <div class="stats-damage-label"><span>DANO A CAMPE&Otilde;ES</span><strong>${formatNumber(player.damageToChampions)}</strong></div>
        <div class="stats-damage"><span style="width:${Math.max(2, numeric(player.damageToChampions) / maxDamage * 100)}%"></span></div>
        <div class="stats-participant-vision"><span>VIS&Atilde;O</span><strong>${formatNumber(player.visionScore)}</strong></div>
      </article>`;
    }).join("")}</div>`;
  }

  function versusTeam(team, stats, won, division, side) {
    const slot = team && team.slot || "";
    const name = team && (team.name || team.tag || team.slot) || "Equipe";
    return `<article class="stats-versus-team ${won ? "winner" : ""}">${teamLogo(team)}<span>${side}</span><h2><a class="stats-entity-link" href="time.html?division=${division}&id=${encodeURIComponent(slot)}">${text(name)}</a></h2><p>${stats.kills || 0} abates &middot; ${formatNumber(stats.gold)} ouro</p>${won ? "<strong>VENCEDOR</strong>" : ""}</article>`;
  }

  function breakdownRow(label, left, right) {
    return `<div class="stats-breakdown-row"><strong>${text(left)}</strong><span>${label}</span><strong>${text(right)}</strong></div>`;
  }

  function playerFilters(players, division) {
    const availableLanes = new Set(players.map((player) => normalizeLane(player.mainPosition)).filter(Boolean));
    const lanes = laneOrder.filter((lane) => availableLanes.has(lane));
    const teamSlots = [...new Set(players.flatMap((player) => (player.teams || []).map((team) => team.slot)).filter(Boolean))];
    const data = divisionData(division);
    return `<div class="stats-filters"><label>Buscar<input type="search" placeholder="Nome ou equipe" data-player-search /></label><div class="stats-filter-field"><span>Posi&ccedil;&atilde;o</span><div class="stats-lane-filter" role="group" aria-label="Filtrar por posi&ccedil;&atilde;o"><button type="button" class="active" data-player-lane-option="" aria-pressed="true">Todas</button>${lanes.map((lane) => `<button type="button" data-player-lane-option="${attribute(lane)}" aria-pressed="false" aria-label="${attribute(lane)}">${laneIcon(lane)}</button>`).join("")}</div><input type="hidden" value="" data-player-lane /></div><label>Equipe<select data-player-team><option value="">Todas</option>${teamSlots.map((slot) => {
      const team = findTeam(data, slot);
      return `<option value="${attribute(slot)}">${text(team && (team.tag || team.name) || slot)}</option>`;
    }).join("")}</select></label></div>`;
  }

  function matchFilters(matches) {
    const stages = [...new Set(matches.map((match) => match.stage).filter(Boolean))];
    return `<div class="stats-filters"><label>Buscar<input type="search" placeholder="Equipe, fase ou s&eacute;rie" data-match-search /></label><label>Fase<select data-match-stage><option value="">Todas</option>${stages.map((stage) => `<option>${text(stage)}</option>`).join("")}</select></label></div>`;
  }

  function setupFilters() {
    const playerInputs = [document.querySelector("[data-player-search]"), document.querySelector("[data-player-lane]"), document.querySelector("[data-player-team]")].filter(Boolean);
    playerInputs.forEach((input) => input.addEventListener("input", filterPlayers));
    playerInputs.forEach((input) => input.addEventListener("change", filterPlayers));
    document.querySelectorAll("[data-player-lane-option]").forEach((button) => button.addEventListener("click", () => {
      const input = document.querySelector("[data-player-lane]");
      if (input) input.value = button.dataset.playerLaneOption || "";
      document.querySelectorAll("[data-player-lane-option]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      filterPlayers();
    }));
    const matchInputs = [document.querySelector("[data-match-search]"), document.querySelector("[data-match-stage]")].filter(Boolean);
    matchInputs.forEach((input) => input.addEventListener("input", filterMatches));
    matchInputs.forEach((input) => input.addEventListener("change", filterMatches));
  }

  function filterPlayers() {
    const search = String(document.querySelector("[data-player-search]")?.value || "").trim().toLowerCase();
    const lane = document.querySelector("[data-player-lane]")?.value || "";
    const team = document.querySelector("[data-player-team]")?.value || "";
    let shown = 0;
    document.querySelectorAll("[data-player-row]").forEach((row) => {
      const visible = (!search || row.dataset.search.includes(search)) && (!lane || row.dataset.lane === lane) && (!team || row.dataset.team === team);
      row.hidden = !visible;
      if (visible) shown += 1;
    });
    const empty = document.querySelector("[data-player-empty]");
    if (empty) empty.hidden = shown > 0;
  }

  function filterMatches() {
    const search = String(document.querySelector("[data-match-search]")?.value || "").trim().toLowerCase();
    const stage = document.querySelector("[data-match-stage]")?.value || "";
    let shown = 0;
    document.querySelectorAll("[data-match-row]").forEach((row) => {
      const visible = (!search || row.dataset.search.includes(search)) && (!stage || row.dataset.stage === stage);
      row.hidden = !visible;
      if (visible) shown += 1;
    });
    const empty = document.querySelector("[data-match-empty]");
    if (empty) empty.hidden = shown > 0;
  }

  function resolveContext(currentPage, division, id) {
    if (currentPage === "match") return findAcrossDivisions("matches", id, division);
    if (currentPage === "player") return findAcrossDivisions("players", id, division);
    if (currentPage === "team") return { division, item: findTeam(divisionData(division), id) };
    return { division, item: null };
  }

  function findAcrossDivisions(collection, id, preferredDivision) {
    const order = [preferredDivision, preferredDivision === "elite" ? "ascension" : "elite"];
    for (const division of order) {
      const item = (divisionData(division)[collection] || []).find((entry) => String(entry.id) === id || String(entry.playerId) === id);
      if (item) return { division, item };
    }
    return { division: preferredDivision, item: null };
  }

  function findTeam(data, id) {
    return (data.teams || []).find((team) => String(team.slot) === String(id) || String(team.id) === String(id));
  }

  function primaryTeam(player, division) {
    const slot = player && player.teams && player.teams[0] && player.teams[0].slot;
    return slot ? findTeam(divisionData(division), slot) : null;
  }

  function divisionData(division) {
    return payload.divisions && payload.divisions[division] || { hasData: false, overview: {}, teams: [], players: [], champions: [], matches: [] };
  }

  function normalizeDivision(value) {
    return value === "ascension" || value === "ascensao" ? "ascension" : "elite";
  }

  function applyDivisionTheme(division) {
    document.body.classList.remove("theme-elite", "theme-ascension");
    document.body.classList.add(division === "ascension" ? "theme-ascension" : "theme-elite");
    document.body.dataset.division = division;
  }

  function hero(title, eyebrow, description) {
    return `<section class="stats-public-hero"><span>${eyebrow}</span><h1>${title}</h1><p>${description}</p></section>`;
  }

  function detailBack(division) {
    return `<nav class="stats-breadcrumb"><a href="${divisionPage(division)}">Voltar para a divis&atilde;o</a><span>/</span><a href="estatisticas.html?division=${division}">Estat&iacute;sticas</a></nav>`;
  }

  function notFound(title, division) {
    return `${detailBack(division)}${hero(title, divisionLabel(division), "Confira o endere&ccedil;o ou retorne para a central de estat&iacute;sticas.")}${emptyState("Este registro n&atilde;o existe no payload p&uacute;blico atual.")}`;
  }

  function sectionTitle(title, subtitle) {
    return `<header class="stats-section-heading"><div><span>LIGA RK 26.2</span><h2>${title}</h2></div><p>${subtitle}</p></header>`;
  }

  function metric(label, value, modifier) {
    const className = modifier ? ` stats-metric-${attribute(modifier)}` : "";
    return `<article class="stats-metric${className}"><span>${label}</span><strong>${value ?? 0}</strong></article>`;
  }

  function emptyState(message) {
    return `<section class="stats-empty-state"><img class="logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="" /><h2>AGUARDANDO RESULTADOS</h2><p>${message}</p></section>`;
  }

  function emptyInline(message) {
    return `<p class="stats-empty-inline">${message}</p>`;
  }

  function compactList(entries, allowHtml) {
    return `<div class="stats-compact-list">${entries.map(([name, value]) => `<div><strong>${allowHtml ? name : text(name)}</strong><span>${text(value)}</span></div>`).join("") || emptyInline("Nenhum dado registrado.")}</div>`;
  }

  function teamLink(team, division) {
    if (!team) return "Equipe";
    return `<a class="stats-entity-link stats-team-link" href="time.html?division=${division}&id=${encodeURIComponent(team.slot)}">${teamLogo(team)}<span><strong>${text(team.name || team.slot)}</strong><small>${text(team.tag || team.slot)}</small></span></a>`;
  }

  function teamLogo(team) {
    const logo = safeImageUrl(team && team.logo) || "assets/logo_rk_placeholder.png";
    return `<img class="stats-team-logo" src="${attribute(logo)}" alt="" loading="lazy" />`;
  }

  function teamName(slot, match) {
    const team = slot === match.blueTeamSlot ? match.blueTeam : match.redTeam;
    return text(team && (team.name || team.tag) || slot || "-");
  }

  function divisionLabel(division) {
    return division === "ascension" ? "DIVIS&Atilde;O ASCENS&Atilde;O" : "DIVIS&Atilde;O ELITE";
  }

  function divisionPage(division) {
    return division === "ascension" ? "ascensao.html#estatisticas" : "elite.html#estatisticas";
  }

  function renderFooter() {
    return `<footer class="site-footer"><img class="footer-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="" /><div><strong>LIGA RK 26.2</strong><span>Estat&iacute;sticas oficiais</span></div></footer>`;
  }

  function numeric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(numeric(value));
  }

  function formatCompactNumber(value) {
    const number = numeric(value);
    if (Math.abs(number) < 1000) return formatNumber(number);
    const compact = number / 1000;
    return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: compact < 10 ? 1 : 0 }).format(compact)}K`;
  }

  function formatDecimal(value) {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(numeric(value));
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function safeImageUrl(value) {
    const url = String(value || "").trim().replace(/\\/g, "/");
    if (/^assets\/[a-z0-9_./-]+$/i.test(url)) return url;
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
    return safeExternalUrl(url);
  }

  function normalizeChampionKey(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  }

  function normalizeIdentity(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function text(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function attribute(value) {
    return text(value).replace(/`/g, "&#096;");
  }
})();
