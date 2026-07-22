(function () {
  const fixedData = window.LIGA_RK_DATA || {};
  const sourceContent = window.LIGA_RK_CONTENT || {};
  const replayStatsData = window.LIGA_RK_STATS || { divisions: {} };
  const playerIdentity = window.LIGA_RK_PLAYER_IDENTITY;
  const groupStandings = window.LIGA_RK_GROUP_STANDINGS;
  const app = document.getElementById("editor-app");

  if (!app) {
    return;
  }

  const divisionLabels = {
    elite: "Elite",
    ascension: "Ascensão"
  };
  const divisionFiles = {
    elite: "elite.html",
    ascension: "ascensao.html"
  };
  const groupLetters = ["A", "B", "C", "D"];
  const laneOrder = ["TOP", "JG", "MID", "ADC", "SUP", "SUB", "SUB", "SUB"];
  const weekdayOptions = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
  const slotOrder = groupLetters.flatMap((group) => [1, 2, 3, 4].map((seed) => `${group}${seed}`));
  const defaultApiBase = "https://liga-rk-api.suporteinhouserk.workers.dev";
  const editorConfig = {
    apiBase: localStorage.getItem("liga-rk-editor-api-base") || defaultApiBase,
    adminToken: localStorage.getItem("liga-rk-editor-admin-token") || ""
  };
  let currentDivision = "elite";
  let state = normalizeContent(sourceContent);
  let identityConflicts = [];

  synchronizeAllReplayResults();
  render();
  loadOnlineContent({ silent: true });

  app.addEventListener("input", handleInput);
  app.addEventListener("change", handleInput);
  app.addEventListener("click", handleClick);

  function normalizeContent(content) {
    const normalized = {
      version: 1,
      divisions: {
        elite: createDivision(1),
        ascension: createDivision(3)
      }
    };
    const incoming = clone(content);

    Object.keys(normalized.divisions).forEach((key) => {
      mergeObject(normalized.divisions[key], incoming.divisions && incoming.divisions[key]);
      ensureDivision(normalized, key);
    });

    return normalized;
  }

  function createDivision(captainIndex) {
    return {
      teams: createTeams(captainIndex),
      weeklyHighlight: "MID",
      weeklySelection: ["TOP", "JG", "MID", "ADC", "SUP"].map((role) => ({
        role,
        player: "JOGADOR",
        team: "EQUIPE",
        teamLogo: "",
        image: ""
      })),
      mvp: { player: "JOGADOR" },
      results: {},
      playoffResults: {},
      vod: createVod(),
      vods: [createVod()],
      statistics: {
        mostPicked: {
          title: "MAIS ESCOLHAS",
          champion: "AATROX",
          value: 0,
          image: "assets/champions/Aatrox.jpg"
        },
        mostWins: {
          title: "MAIS VITÓRIAS",
          champion: "AATROX",
          value: 0,
          image: "assets/champions/Aatrox.jpg"
        },
        playerStats: [
          { label: "MELHOR KDA", player: "JOGADOR", value: "00.00" },
          { label: "MELHOR KP", player: "JOGADOR", value: "00.00" },
          { label: "MELHOR DPM", player: "JOGADOR", value: "00.00" },
          { label: "MELHOR GPM", player: "JOGADOR", value: "00.00" },
          { label: "MELHOR VS", player: "JOGADOR", value: "00.00" }
        ]
      },
      rules: ""
    };
  }

  function createVod() {
    return {
      url: "",
      title: "",
      thumbnail: ""
    };
  }

  function createTeams(captainIndex) {
    return slotOrder.reduce((teams, slot) => {
      teams[slot] = {
        name: "",
        tag: "",
        logo: "",
        avgWinTime: "00:00",
        players: laneOrder.map((lane, index) => ({
          lane,
          player: "",
          opgg: "",
          captain: index === captainIndex,
          playerId: "",
          riotId: "",
          gameName: "",
          tagLine: "",
          riotIdAliases: []
        }))
      };
      return teams;
    }, {});
  }

  function ensureDivision(targetState, key) {
    const division = targetState.divisions[key];
    const fixed = fixedData[key] || {};

    slotOrder.forEach((slot) => {
      if (!division.teams[slot]) {
        division.teams[slot] = createTeams(key === "elite" ? 1 : 3)[slot];
      }
      division.teams[slot].tag = String(division.teams[slot].tag || "").slice(0, 4).toUpperCase();
      if (!Array.isArray(division.teams[slot].players)) {
        division.teams[slot].players = [];
      }
      laneOrder.forEach((lane, index) => {
        const existingPlayer = division.teams[slot].players[index] || {};
        const defaults = {
          lane,
          player: normalizeRosterPlayerName(existingPlayer.player || existingPlayer.name),
          opgg: existingPlayer.opgg || "",
          captain: Boolean(existingPlayer.captain)
        };
        division.teams[slot].players[index] = playerIdentity
          ? playerIdentity.migratePlayer(existingPlayer, defaults)
          : { ...existingPlayer, ...defaults };
      });
    });

    ["TOP", "JG", "MID", "ADC", "SUP"].forEach((role, index) => {
      division.weeklySelection[index] = {
        role,
        player: (division.weeklySelection[index] && division.weeklySelection[index].player) || "JOGADOR",
        team: (division.weeklySelection[index] && division.weeklySelection[index].team) || "EQUIPE",
        teamLogo: (division.weeklySelection[index] && division.weeklySelection[index].teamLogo) || "",
        image: (division.weeklySelection[index] && division.weeklySelection[index].image) || ""
      };
    });
    if (!["TOP", "JG", "MID", "ADC", "SUP"].includes(String(division.weeklyHighlight || "").toUpperCase())) {
      division.weeklyHighlight = "MID";
    }

    (fixed.rounds || []).forEach((round, roundIndex) => {
      (round.games || []).forEach((game, gameIndex) => {
        const normalized = normalizeGame(game);
        const keyName = gameKey(roundIndex, gameIndex);
        division.results[keyName] = {
          time: normalized.time,
          weekday: weekdayFromDate(round.date),
          homeScore: "",
          awayScore: "",
          ...(division.results[keyName] || {})
        };
        division.results[keyName].weekday = normalizeWeekday(division.results[keyName].weekday) || weekdayFromDate(round.date);
      });
    });

    (fixed.playoffs || []).forEach((column, columnIndex) => {
      (column || []).forEach((match, matchIndex) => {
        const keyName = playoffKey(columnIndex, matchIndex);
        division.playoffResults[keyName] = {
          teamAScore: "",
          teamBScore: "",
          ...(division.playoffResults[keyName] || {})
        };
      });
    });

    if (!Array.isArray(division.vods)) {
      division.vods = [normalizeVod(division.vod || createVod())];
    }
    division.vods = division.vods.filter(Boolean).map(normalizeVod);
    if (!division.vods.length) {
      division.vods = [createVod()];
    }
    division.vod = normalizeVod(division.vods[0]);
  }

  function mergeObject(target, source) {
    if (!source || typeof source !== "object") {
      return target;
    }

    Object.keys(source).forEach((key) => {
      const value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
          target[key] = {};
        }
        mergeObject(target[key], value);
      } else {
        target[key] = value;
      }
    });

    return target;
  }

  function render() {
    identityConflicts = playerIdentity ? playerIdentity.collectConflicts(state) : [];
    app.innerHTML = `
      <header class="editor-header">
        <a class="brand" href="index.html">
          <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="LIGA RK 26.2" />
          <span>Editor LIGA RK 26.2</span>
        </a>
        <div class="editor-actions">
          <button type="button" data-action="check-online">Testar acesso</button>
          <button type="button" data-action="publish-online">Publicar online</button>
          <button type="button" data-action="load-online">Carregar online</button>
          <button type="button" data-action="download">Baixar backup</button>
          <label class="file-button">
            Importar backup
            <input type="file" accept=".js,.json" data-action="import" />
          </label>
        </div>
      </header>

      <main class="editor-shell">
        <section class="editor-intro">
          <div class="editor-grid-2 editor-config-grid">
            <label class="editor-field">
              <span>API da Liga RK</span>
              <input data-config="apiBase" value="${escapeAttribute(editorConfig.apiBase)}" placeholder="https://liga-rk-api...workers.dev" />
            </label>
            <label class="editor-field">
              <span>Token de administrador</span>
              <input data-config="adminToken" type="password" value="${escapeAttribute(editorConfig.adminToken)}" placeholder="cole o token do Worker" autocomplete="off" />
            </label>
          </div>
          <h1>Dados editáveis</h1>
          <p>Preencha os campos, salve o arquivo <strong>assets/content.js</strong> e recarregue as páginas da divisão.</p>
          <nav class="editor-tabs" aria-label="Divisões">
            ${Object.keys(divisionLabels)
              .map(
                (key) => `
                  <button type="button" class="${currentDivision === key ? "active" : ""}" data-division="${key}">
                    ${divisionLabels[key]}
                  </button>
                `
              )
              .join("")}
          </nav>
          <div class="editor-preview-links">
            <a href="${divisionFiles[currentDivision]}" target="_blank" rel="noreferrer">Abrir ${divisionLabels[currentDivision]}</a>
          </div>
          <p class="editor-status" id="editor-status" aria-live="polite"></p>
        </section>

        <form class="editor-form">
          ${renderDivision(currentDivision)}
        </form>
      </main>
    `;
    hydrateEditorIntro();
  }

  function hydrateEditorIntro() {
    const title = app.querySelector(".editor-intro h1");
    const copy = app.querySelector(".editor-intro p");

    if (title) {
      title.textContent = "Painel de conteudo";
    }
    if (copy) {
      copy.innerHTML = 'Preencha os campos e clique em <strong>Publicar online</strong>. As paginas das divisoes buscam esses dados na API automaticamente.';
    }
  }

  function rerenderPreservingOpenSections() {
    const statusMessage = document.getElementById("editor-status")?.textContent || "";
    const openSections = Array.from(document.querySelectorAll(".editor-section"))
      .map((section, index) => ({
        index,
        open: section.open
      }))
      .filter((section) => section.open)
      .map((section) => section.index);
    const scrollTop = window.scrollY;

    render();

    document.querySelectorAll(".editor-section").forEach((section, index) => {
      section.open = openSections.includes(index);
    });
    if (statusMessage) {
      setStatus(statusMessage);
    }
    window.scrollTo({ top: scrollTop, behavior: "auto" });
  }

  function renderDivision(key) {
    return `
      ${renderTeamsSection(key)}
      ${renderWeeklySection(key)}
      ${renderCalendarSection(key)}
      ${renderPlayoffsSection(key)}
      ${renderVodsSection(key)}
    `;
  }

  function renderTeamsSection(key) {
    return `
      <details class="editor-section">
        <summary>Times e jogadores</summary>
        <div class="editor-team-grid">
          ${slotOrder.map((slot) => renderTeamCard(key, slot)).join("")}
        </div>
      </details>
    `;
  }

  function renderTeamCard(key, slot) {
    const team = state.divisions[key].teams[slot];

    return `
      <article class="editor-card">
        <h3>${slot} ${team.name ? `- ${escapeHtml(team.name)}` : ""}</h3>
        <div class="editor-logo-preview">${renderImagePreview(team.logo, "Logo")}</div>
        ${field("Nome do time", `divisions.${key}.teams.${slot}.name`, team.name, "Nome do Time")}
        ${field("TAG (máx. 4)", `divisions.${key}.teams.${slot}.tag`, team.tag, "RK", "text", "", "", 4)}
        ${field("Logo do time", `divisions.${key}.teams.${slot}.logo`, team.logo, "assets/uploads/logo-time.png")}
        ${field("TM", `divisions.${key}.teams.${slot}.avgWinTime`, team.avgWinTime, "00:00")}
        <div class="editor-player-list">
          ${team.players.map((player, index) => renderPlayerRow(key, slot, player, index)).join("")}
        </div>
      </article>
    `;
  }

  function renderPlayerRow(key, slot, player, index) {
    const parsedRiotId = playerIdentity ? playerIdentity.parseRiotId(player.riotId) : { valid: false };
    const conflict = identityConflicts.find((item) => (
      (item.first.division === key && item.first.slot === slot && item.first.playerIndex === index) ||
      (item.second.division === key && item.second.slot === slot && item.second.playerIndex === index)
    ));
    const statusClass = conflict ? "duplicate" : player.riotId ? (parsedRiotId.valid ? "valid" : "invalid") : "empty";
    const statusText = conflict ? "Riot ID duplicado" : player.riotId ? (parsedRiotId.valid ? "Gerado pelo OP.GG" : "OP.GG sem Riot ID valido") : "Aguardando link OP.GG";
    const basePath = `divisions.${key}.teams.${slot}.players.${index}`;

    return `
      <div class="editor-player-row">
        <strong>${escapeHtml(player.lane)}</strong>
        ${input(`${basePath}.player`, player.player, "Nome do jogador")}
        ${input(`${basePath}.opgg`, player.opgg, "Link OP.GG")}
        <label class="captain-toggle">
          <input type="radio" name="captain-${key}-${slot}" data-captain-slot="${slot}" data-captain-division="${key}" value="${index}" ${player.captain ? "checked" : ""} />
          Capitão
        </label>
        <div class="editor-riot-identity">
          <div class="editor-field editor-riot-primary editor-riot-readonly">
            <span>Riot ID principal</span>
            <strong>${escapeHtml(player.riotId || "Preenchido automaticamente pelo OP.GG")}</strong>
          </div>
          <span class="riot-id-status ${statusClass}">${escapeHtml(statusText)}</span>
          <div class="editor-alias-list">
            ${(player.riotIdAliases || []).map((alias, aliasIndex) => `
              <div class="editor-alias-row">
                ${input(`${basePath}.riotIdAliases.${aliasIndex}.riotId`, alias.riotId || "", "Riot ID alternativo#BR1")}
                <button type="button" class="icon-text-button danger-button" data-alias-action="remove" data-alias-division="${key}" data-alias-slot="${slot}" data-player-index="${index}" data-alias-index="${aliasIndex}">Remover</button>
              </div>
            `).join("")}
            <button type="button" class="icon-text-button" data-alias-action="add" data-alias-division="${key}" data-alias-slot="${slot}" data-player-index="${index}">Adicionar Riot ID alternativo</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderWeeklySection(key) {
    const division = state.divisions[key];
    const highlight = String(division.weeklyHighlight || "MID").toUpperCase();

    return `
      <details class="editor-section">
        <summary>Seleção da semana</summary>
        <div class="editor-grid-2">
          ${division.weeklySelection
            .map(
              (player, index) => `
                <article class="editor-card">
                  <h3>${escapeHtml(player.role)}</h3>
                  <div class="editor-logo-preview">${renderImagePreview(player.image, "Foto")}</div>
                  ${field("Jogador", `divisions.${key}.weeklySelection.${index}.player`, player.player, "JOGADOR")}
                  ${field("Equipe", `divisions.${key}.weeklySelection.${index}.team`, player.team, "A1 ou nome da equipe")}
                  ${field("Logo da equipe", `divisions.${key}.weeklySelection.${index}.teamLogo`, player.teamLogo, "assets/uploads/logo-time.png")}
                  ${field("Foto", `divisions.${key}.weeklySelection.${index}.image`, player.image, "assets/uploads/jogador.png")}
                  <label class="captain-toggle weekly-highlight-toggle">
                    <input type="radio" name="weekly-highlight-${key}" data-weekly-highlight="${key}" value="${escapeAttribute(player.role)}" ${String(player.role).toUpperCase() === highlight ? "checked" : ""} />
                    Destaque da semana
                  </label>
                </article>
              `
            )
            .join("")}
        </div>
      </details>
    `;
  }

  function renderCalendarSection(key) {
    const fixed = fixedData[key] || {};

    return `
      <details class="editor-section">
        <summary>Calendário grupos</summary>
        <div class="calendar-editor">
          ${(fixed.rounds || []).map((round, roundIndex) => renderRoundEditor(key, round, roundIndex)).join("")}
        </div>
      </details>
    `;
  }

  function renderRoundEditor(key, round, roundIndex) {
    return `
      <article class="editor-card calendar-round-editor">
        <h3>${escapeHtml(round.name)} - ${escapeHtml(round.date)}</h3>
        ${(round.games || []).map((game, gameIndex) => renderGameEditor(key, game, roundIndex, gameIndex)).join("")}
      </article>
    `;
  }

  function renderGameEditor(key, game, roundIndex, gameIndex) {
    const normalized = normalizeGame(game);
    const resultKey = gameKey(roundIndex, gameIndex);
    const result = state.divisions[key].results[resultKey];
    const homeTeam = state.divisions[key].teams[normalized.home];
    const awayTeam = state.divisions[key].teams[normalized.away];
    const automatic = replaySeriesScore(key, `groups-${resultKey}`, normalized.home, normalized.away, 2);

    return `
      <div class="calendar-editor-row">
        <div class="calendar-editor-schedule">
          ${weekdaySelect(`divisions.${key}.results.${resultKey}.weekday`, result.weekday)}
          ${input(`divisions.${key}.results.${resultKey}.time`, result.time, "Horário", "time")}
        </div>
        ${renderEditorTeamLogo(homeTeam.logo)}
        <strong>${escapeHtml(editorCalendarTeamName(homeTeam, normalized.home))}</strong>
        ${input(`divisions.${key}.results.${resultKey}.homeScore`, result.homeScore, "0-2", "number", "0", "2")}
        <span class="editor-versus">x</span>
        ${input(`divisions.${key}.results.${resultKey}.awayScore`, result.awayScore, "0-2", "number", "0", "2")}
        <strong>${escapeHtml(editorCalendarTeamName(awayTeam, normalized.away))}</strong>
        ${renderEditorTeamLogo(awayTeam.logo)}
        ${renderScoreSource(key, "calendar", resultKey, result, automatic)}
      </div>
    `;
  }

  function renderPlayoffsSection(key) {
    const fixed = fixedData[key] || {};
    const playoffState = computeEditorPlayoffState(key);

    return `
      <details class="editor-section">
        <summary>Playoffs</summary>
        <div class="playoff-editor">
          ${(fixed.playoffs || []).map((column, columnIndex) => renderPlayoffColumnEditor(key, column, columnIndex, playoffState)).join("")}
        </div>
      </details>
    `;
  }

  function renderPlayoffColumnEditor(key, column, columnIndex, playoffState) {
    return `
      <div class="playoff-editor-column">
        ${(column || []).map((match, matchIndex) => renderPlayoffMatchEditor(key, match, columnIndex, matchIndex, playoffState)).join("")}
      </div>
    `;
  }

  function renderPlayoffMatchEditor(key, match, columnIndex, matchIndex, playoffState) {
    const resultKey = playoffKey(columnIndex, matchIndex);
    const result = state.divisions[key].playoffResults[resultKey];
    const resolved = playoffState.matches[resultKey] || {};
    const maxScore = String(match.format).toUpperCase() === "MD5" ? 3 : 2;
    const automatic = replaySeriesScore(
      key,
      `playoffs-${resultKey}`,
      resolved.teamA && resolved.teamA.slot,
      resolved.teamB && resolved.teamB.slot,
      maxScore
    );

    return `
      <article class="editor-card playoff-match-editor">
        <h3>${escapeHtml(match.title)} <span>${escapeHtml(match.date)} ${escapeHtml(match.time)} ${escapeHtml(match.format)}</span></h3>
        <div class="playoff-editor-row">
          ${renderEditorPlayoffLogo(key, resolved.teamA && resolved.teamA.slot)}
          <strong>${escapeHtml((resolved.teamA && resolved.teamA.text) || match.teamA)}</strong>
          ${input(`divisions.${key}.playoffResults.${resultKey}.teamAScore`, result.teamAScore, `0-${maxScore}`, "number", "0", String(maxScore))}
        </div>
        <div class="playoff-editor-row">
          ${renderEditorPlayoffLogo(key, resolved.teamB && resolved.teamB.slot)}
          <strong>${escapeHtml((resolved.teamB && resolved.teamB.text) || match.teamB)}</strong>
          ${input(`divisions.${key}.playoffResults.${resultKey}.teamBScore`, result.teamBScore, `0-${maxScore}`, "number", "0", String(maxScore))}
        </div>
        ${renderScoreSource(key, "playoffs", resultKey, result, automatic)}
      </article>
    `;
  }

  function renderScoreSource(key, type, resultKey, result, automatic) {
    if (!automatic) {
      return `<span class="editor-score-source empty">Sem replay confirmado</span>`;
    }
    const label = `Replays: ${automatic.scoreA} x ${automatic.scoreB}`;
    return result.manualOverride
      ? `<span class="editor-score-source manual">${escapeHtml(label)} <button type="button" data-score-reset="${type}" data-score-division="${key}" data-score-key="${resultKey}">Usar replays</button></span>`
      : `<span class="editor-score-source automatic">${escapeHtml(label)} &middot; autom&aacute;tico</span>`;
  }

  function renderEditorTeamLogo(path) {
    if (path) {
      return `<span class="editor-team-logo"><img src="${escapeAttribute(path)}" alt="" /></span>`;
    }

    return `<span class="editor-team-logo"><span class="team-mark" aria-hidden="true"></span></span>`;
  }

  function renderEditorPlayoffLogo(key, slot) {
    const team = slot && state.divisions[key].teams[slot];
    return renderEditorTeamLogo(team && team.logo);
  }

  function renderVodsSection(key) {
    const vods = state.divisions[key].vods || [];

    return `
      <details class="editor-section">
        <summary>VODs</summary>
        <div class="vod-editor-list">
          ${vods.map((vod, index) => renderVodEditor(key, vod, index)).join("")}
        </div>
        <div class="editor-action-row">
          <button type="button" data-vod-action="add" data-vod-division="${key}">Adicionar VOD</button>
        </div>
      </details>
    `;
  }

  function renderVodEditor(key, vod, index) {
    const thumbnail = vod.thumbnail || youtubeThumbnail(vod.url);
    const title = vod.title || youtubeTitleFallback(vod.url);

    return `
      <article class="editor-card vod-editor-card" data-vod-card="${index}">
        <h3>VOD ${index + 1}</h3>
        <div class="editor-logo-preview wide vod-preview">${renderImagePreview(thumbnail, title)}</div>
        <div class="vod-editor-title" data-vod-title-preview="${index}">${escapeHtml(title)}</div>
        ${field("Link do VOD", `divisions.${key}.vods.${index}.url`, vod.url, "https://www.youtube.com/watch?v=...")}
        <button class="danger-button" type="button" data-vod-action="remove" data-vod-division="${key}" data-vod-index="${index}">Remover VOD</button>
      </article>
    `;
  }

  function renderStatisticsSection(key) {
    const stats = state.divisions[key].statistics;

    return `
      <details class="editor-section">
        <summary>Estatísticas</summary>
        <div class="editor-grid-3">
          ${renderChampionEditor(key, "mostPicked", stats.mostPicked)}
          ${renderChampionEditor(key, "mostWins", stats.mostWins)}
        </div>
        <div class="editor-grid-2">
          ${stats.playerStats.map((stat, index) => renderPlayerStatEditor(key, stat, index)).join("")}
        </div>
      </details>
    `;
  }

  function renderChampionEditor(key, statKey, stat) {
    return `
      <article class="editor-card">
        <h3>${escapeHtml(stat.title)}</h3>
        <div class="editor-logo-preview wide">${renderImagePreview(stat.image, stat.champion)}</div>
        ${field("Título", `divisions.${key}.statistics.${statKey}.title`, stat.title, "MAIS ESCOLHAS")}
        ${field("Campeão", `divisions.${key}.statistics.${statKey}.champion`, stat.champion, "AATROX")}
        ${field("Valor", `divisions.${key}.statistics.${statKey}.value`, stat.value, "0", "number")}
        ${field("Splash", `divisions.${key}.statistics.${statKey}.image`, stat.image, "assets/champions/Aatrox.jpg")}
      </article>
    `;
  }

  function renderPlayerStatEditor(key, stat, index) {
    return `
      <article class="editor-card compact-card">
        ${field("Estatística", `divisions.${key}.statistics.playerStats.${index}.label`, stat.label, "MELHOR KDA")}
        ${field("Jogador", `divisions.${key}.statistics.playerStats.${index}.player`, stat.player, "JOGADOR")}
        ${field("Valor", `divisions.${key}.statistics.playerStats.${index}.value`, stat.value, "00.00")}
      </article>
    `;
  }

  function renderRulesSection(key) {
    const rules = state.divisions[key].rules || "";

    return `
      <details class="editor-section">
        <summary>Regras</summary>
        <label class="editor-field">
          <span>Conteúdo geral</span>
          <textarea data-path="divisions.${key}.rules" rows="12" placeholder="Digite as regras aqui...">${escapeHtml(rules)}</textarea>
        </label>
      </details>
    `;
  }

  function handleInput(event) {
    const target = event.target;

    if (target.dataset.config) {
      editorConfig[target.dataset.config] = target.value.trim();
      localStorage.setItem(`liga-rk-editor-${target.dataset.config === "apiBase" ? "api-base" : "admin-token"}`, editorConfig[target.dataset.config]);
      return;
    }

    if (target.matches("[data-captain-slot]")) {
      const key = target.dataset.captainDivision;
      const slot = target.dataset.captainSlot;
      const captainIndex = Number(target.value);
      state.divisions[key].teams[slot].players.forEach((player, index) => {
        player.captain = index === captainIndex;
      });
      markDirty();
      return;
    }

    if (target.matches("[data-weekly-highlight]")) {
      state.divisions[target.dataset.weeklyHighlight].weeklyHighlight = String(target.value || "MID").toUpperCase();
      markDirty();
      return;
    }

    if (!target.dataset.path) {
      return;
    }

    const nextValue = target.dataset.path.endsWith(".tag")
      ? target.value.slice(0, 4).toUpperCase()
      : target.type === "number" && target.value !== ""
        ? Number(target.value)
        : target.value;
    if (target.dataset.path.endsWith(".tag")) {
      target.value = nextValue;
    }
    setPath(target.dataset.path, nextValue);
    if (target.dataset.path.includes(".results.") || target.dataset.path.includes(".playoffResults.")) {
      markScoreManualOverride(target.dataset.path);
    }
    if (/\.players\.\d+\.opgg$/.test(target.dataset.path)) {
      synchronizeRiotIdentityFromOpgg(target.dataset.path);
      if (event.type === "change") {
        rerenderPreservingOpenSections();
      }
    }
    if (/\.riotIdAliases\.\d+\.riotId$/.test(target.dataset.path)) {
      synchronizeRiotIdentity(target.dataset.path);
      if (event.type === "change") {
        rerenderPreservingOpenSections();
      }
    }
    if (/\.vods\.\d+\.url$/.test(target.dataset.path)) {
      syncVodFromUrl(target.dataset.path, nextValue, target.closest(".vod-editor-card"), event.type === "change");
    }
    if (event.type === "change" && (target.dataset.path.includes(".results.") || target.dataset.path.includes(".playoffResults."))) {
      rerenderPreservingOpenSections();
    }
    markDirty();
  }

  function handleClick(event) {
    const divisionButton = event.target.closest("[data-division]");
    const vodButton = event.target.closest("[data-vod-action]");
    const aliasButton = event.target.closest("[data-alias-action]");
    const scoreResetButton = event.target.closest("[data-score-reset]");
    const actionButton = event.target.closest("[data-action]");

    if (divisionButton) {
      currentDivision = divisionButton.dataset.division;
      render();
      return;
    }

    if (vodButton) {
      handleVodAction(vodButton);
      return;
    }

    if (aliasButton) {
      handleAliasAction(aliasButton);
      return;
    }

    if (scoreResetButton) {
      resetScoreToReplay(scoreResetButton);
      return;
    }

    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;

    if (action === "download") {
      downloadFile();
    }
    if (action === "copy") {
      copyFile();
    }
    if (action === "publish-online") {
      publishOnline();
    }
    if (action === "check-online") {
      checkOnlineAccess();
    }
    if (action === "load-online") {
      loadOnlineContent({ silent: false });
    }
    if (action === "save-file") {
      saveFile();
    }
  }

  app.addEventListener("change", (event) => {
    if (event.target.dataset.action !== "import") {
      return;
    }
    importFile(event.target.files && event.target.files[0]);
  });

  function handleVodAction(button) {
    const key = button.dataset.vodDivision;
    const division = state.divisions[key];

    if (!division || !Array.isArray(division.vods)) {
      return;
    }

    if (button.dataset.vodAction === "add") {
      division.vods.push(createVod());
      syncLegacyVod(key);
      render();
      markDirty();
      return;
    }

    if (button.dataset.vodAction === "remove") {
      const index = Number(button.dataset.vodIndex);
      if (division.vods.length > 1) {
        division.vods.splice(index, 1);
      } else {
        division.vods[0] = createVod();
      }
      syncLegacyVod(key);
      render();
      markDirty();
    }
  }

  function handleAliasAction(button) {
    const division = state.divisions[button.dataset.aliasDivision];
    const team = division && division.teams[button.dataset.aliasSlot];
    const player = team && team.players[Number(button.dataset.playerIndex)];
    if (!player) {
      return;
    }

    if (!Array.isArray(player.riotIdAliases)) {
      player.riotIdAliases = [];
    }
    if (button.dataset.aliasAction === "add") {
      player.riotIdAliases.push({ riotId: "", gameName: "", tagLine: "", normalizedRiotId: "" });
    } else {
      player.riotIdAliases.splice(Number(button.dataset.aliasIndex), 1);
    }
    rerenderPreservingOpenSections();
    markDirty();
  }

  function synchronizeRiotIdentity(path) {
    if (!playerIdentity) {
      return;
    }
    const primaryMatch = /^divisions\.([^.]+)\.teams\.([^.]+)\.players\.(\d+)\.riotId$/.exec(path);
    const aliasMatch = /^divisions\.([^.]+)\.teams\.([^.]+)\.players\.(\d+)\.riotIdAliases\.(\d+)\.riotId$/.exec(path);
    const match = primaryMatch || aliasMatch;
    if (!match) {
      return;
    }
    const player = state.divisions[match[1]].teams[match[2]].players[Number(match[3])];
    if (primaryMatch) {
      const parsed = playerIdentity.parseRiotId(player.riotId);
      player.riotId = parsed.riotId;
      player.gameName = parsed.gameName;
      player.tagLine = parsed.tagLine;
      if (!player.playerId && playerIdentity.isRegisteredPlayer(player)) {
        player.playerId = playerIdentity.createPlayerId();
      }
      return;
    }
    player.riotIdAliases[Number(match[4])] = playerIdentity.normalizeAlias(player.riotIdAliases[Number(match[4])]);
  }

  function synchronizeRiotIdentityFromOpgg(path) {
    if (!playerIdentity) {
      return;
    }
    const match = /^divisions\.([^.]+)\.teams\.([^.]+)\.players\.(\d+)\.opgg$/.exec(path);
    if (!match) {
      return;
    }
    const player = state.divisions[match[1]].teams[match[2]].players[Number(match[3])];
    const migrated = playerIdentity.migratePlayer(player);
    Object.assign(player, migrated);
  }

  function syncVodFromUrl(path, url, card, shouldFetchTitle) {
    const match = /^divisions\.([^.]+)\.vods\.(\d+)\.url$/.exec(path);
    if (!match) {
      return;
    }

    const key = match[1];
    const index = Number(match[2]);
    const vod = state.divisions[key].vods[index];
    if (!vod) {
      return;
    }

    vod.thumbnail = youtubeThumbnail(url);
    vod.title = vod.thumbnail ? youtubeTitleFallback(url) : "";
    syncLegacyVod(key);
    updateVodPreview(card, vod);

    if (!shouldFetchTitle || !vod.thumbnail) {
      return;
    }

    fetchYouTubeTitle(url)
      .then((title) => {
        if (!title || state.divisions[key].vods[index].url !== url) {
          return;
        }
        state.divisions[key].vods[index].title = title;
        syncLegacyVod(key);
        updateVodPreview(card, state.divisions[key].vods[index]);
        setStatus("TÃ­tulo do YouTube encontrado. Salve o content.js para manter a alteraÃ§Ã£o.");
      })
      .catch(() => {
        setStatus("NÃ£o consegui ler o tÃ­tulo do YouTube agora, mas a miniatura foi gerada pelo link.");
      });
  }

  function updateVodPreview(card, vod) {
    if (!card) {
      return;
    }

    const preview = card.querySelector(".vod-preview");
    const titleNode = card.querySelector("[data-vod-title-preview]");
    const title = vod.title || youtubeTitleFallback(vod.url);

    if (preview) {
      preview.innerHTML = renderImagePreview(vod.thumbnail, title);
    }
    if (titleNode) {
      titleNode.textContent = title;
    }
  }

  function syncLegacyVod(key) {
    state.divisions[key].vod = normalizeVod((state.divisions[key].vods || [])[0] || createVod());
  }

  async function loadOnlineContent(options = {}) {
    const apiBase = normalizeApiBase(editorConfig.apiBase);
    if (!apiBase) {
      if (!options.silent) {
        setStatus("Informe a URL da API da Liga RK.");
      }
      return;
    }

    try {
      if (!options.silent) {
        setStatus("Carregando dados online...");
      }
      const response = await fetch(`${apiBase}/api/content?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`API retornou ${response.status}.`);
      }

      const payload = await response.json();
      const nextContent = payload.content && payload.content.divisions ? payload.content : payload;
      if (!nextContent || !nextContent.divisions) {
        throw new Error("A API ainda nao tem conteudo publicado.");
      }

      state = normalizeContent(alignOnlineTeamsToOfficialDraw(nextContent));
      synchronizeAllReplayResults();
      render();
      setStatus("Dados online carregados.");
    } catch (error) {
      if (!options.silent) {
        setStatus(error.message || "Nao consegui carregar os dados online.");
      }
    }
  }

  async function publishOnline() {
    const apiBase = normalizeApiBase(editorConfig.apiBase);
    const adminToken = String(editorConfig.adminToken || "").trim();
    const identityValidation = preparePlayerIdentitiesSafely();
    const publishButton = app.querySelector('[data-action="publish-online"]');

    if (!apiBase) {
      setStatus("Informe a URL da API da Liga RK.");
      return;
    }
    if (!adminToken) {
      setStatus("Informe o token de administrador do Worker.");
      return;
    }
    if (!identityValidation.ok) {
      setStatus(identityValidation.error);
      rerenderPreservingOpenSections();
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);

    Object.keys(state.divisions).forEach(syncLegacyVod);
    setStatus("Publicando dados online...");
    if (publishButton) {
      publishButton.disabled = true;
      publishButton.textContent = "Publicando...";
    }

    try {
      const response = await fetch(`${apiBase}/api/admin/content`, {
        method: "PUT",
        mode: "cors",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: state })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("O token não confere com o segredo ADMIN_TOKEN do Worker. Cole novamente o token correto e tente publicar.");
        }
        if (response.status === 404) {
          throw new Error("A rota de publicação não existe no Worker implantado. Atualize o código do Worker e faça o deploy.");
        }
        throw new Error(payload.error || `A API recusou a publicação com o código ${response.status}.`);
      }

      const confirmation = payload.updatedAt ? ` Atualização: ${formatPublishTime(payload.updatedAt)}.` : "";
      setStatus(`Publicado online com sucesso.${confirmation} Recarregue Elite/Ascensão para conferir.`);
    } catch (error) {
      if (error && error.name === "AbortError") {
        setStatus("A publicação demorou mais de 30 segundos e foi cancelada. Confira a conexão e tente novamente.");
      } else if (/failed to fetch|networkerror|load failed/i.test(String(error && error.message || ""))) {
        setStatus("Não foi possível alcançar o Worker. Confira a URL da API, a conexão e se o Worker está implantado.");
      } else {
        setStatus(error.message || "Não consegui publicar online.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (publishButton) {
        publishButton.disabled = false;
        publishButton.textContent = "Publicar online";
      }
    }
  }

  function alignOnlineTeamsToOfficialDraw(onlineContent) {
    const aligned = clone(onlineContent);

    for (const divisionKey of Object.keys(divisionLabels)) {
      const officialTeams = sourceContent.divisions && sourceContent.divisions[divisionKey] && sourceContent.divisions[divisionKey].teams;
      const onlineTeams = aligned.divisions && aligned.divisions[divisionKey] && aligned.divisions[divisionKey].teams;

      if (!officialTeams || !onlineTeams || Object.keys(officialTeams).length !== 16 || Object.keys(onlineTeams).length !== 16) {
        continue;
      }

      const available = Object.entries(onlineTeams);
      const usedSlots = new Set();
      const remappedTeams = {};
      let complete = true;

      for (const slot of slotOrder) {
        const officialTeam = officialTeams[slot] || {};
        const match = available.find(([onlineSlot, onlineTeam]) => {
          if (usedSlots.has(onlineSlot)) return false;
          return sameTeamIdentity(officialTeam, onlineTeam);
        });

        if (!match) {
          complete = false;
          break;
        }

        usedSlots.add(match[0]);
        remappedTeams[slot] = match[1];
      }

      if (complete) {
        aligned.divisions[divisionKey].teams = remappedTeams;
      }
    }

    return aligned;
  }

  function sameTeamIdentity(first, second) {
    const firstTag = normalizeTeamIdentity(first && first.tag);
    const secondTag = normalizeTeamIdentity(second && second.tag);
    const firstName = normalizeTeamIdentity(first && first.name);
    const secondName = normalizeTeamIdentity(second && second.name);
    return Boolean((firstTag && firstTag === secondTag) || (firstName && firstName === secondName));
  }

  function normalizeTeamIdentity(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  }

  function formatPublishTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value || "")
      : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
  }

  async function checkOnlineAccess() {
    const apiBase = normalizeApiBase(editorConfig.apiBase);
    const adminToken = String(editorConfig.adminToken || "").trim();
    if (!apiBase || !adminToken) {
      setStatus("Informe a URL da API e o token de administrador antes de testar.");
      return;
    }

    setStatus("Testando o acesso administrativo...");
    try {
      const response = await fetch(`${apiBase}/api/admin/check?v=${Date.now()}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Token inv\u00e1lido. Ele precisa ser exatamente o mesmo valor do segredo ADMIN_TOKEN configurado no Worker.");
        }
        if (response.status === 404) {
          throw new Error("O Worker online ainda n\u00e3o possui a rota de teste. Implante a vers\u00e3o atualizada do Worker.");
        }
        throw new Error(payload.error || `A API retornou ${response.status}.`);
      }
      setStatus("Acesso confirmado. O editor est\u00e1 autorizado a publicar online.");
    } catch (error) {
      setStatus(error.message || "N\u00e3o foi poss\u00edvel testar o acesso ao Worker.");
    }
  }

  async function saveFile() {
    const identityValidation = preparePlayerIdentitiesSafely();
    if (!identityValidation.ok) {
      setStatus(identityValidation.error);
      rerenderPreservingOpenSections();
      return;
    }
    const content = buildFileContent();

    if (!window.showSaveFilePicker) {
      downloadFile();
      setStatus("Seu navegador não permitiu salvar direto. Baixei o content.js para você substituir na pasta assets.");
      return;
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "content.js",
        types: [
          {
            description: "Arquivo JavaScript",
            accept: { "text/javascript": [".js"] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      setStatus("content.js salvo. Recarregue Elite/Ascensão para ver as alterações.");
    } catch (error) {
      if (error.name !== "AbortError") {
        setStatus("Não consegui salvar direto. Use o botão Baixar content.js.");
      }
    }
  }

  function downloadFile() {
    const blob = new Blob([buildFileContent()], { type: "text/javascript" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "liga-rk-content-backup.js";
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("Backup baixado. Use apenas se quiser guardar uma copia local dos dados.");
  }

  async function copyFile() {
    const identityValidation = preparePlayerIdentitiesSafely();
    if (!identityValidation.ok) {
      setStatus(identityValidation.error);
      rerenderPreservingOpenSections();
      return;
    }
    try {
      await navigator.clipboard.writeText(buildFileContent());
      setStatus("Conteúdo copiado.");
    } catch (error) {
      setStatus("Não consegui copiar automaticamente.");
    }
  }

  async function importFile(file) {
    if (!file) {
      return;
    }

    const text = await file.text();
    try {
      const imported = parseContent(text);
      state = normalizeContent(imported);
      synchronizeAllReplayResults();
      render();
      setStatus("Arquivo importado.");
    } catch (error) {
      setStatus("Arquivo inválido. Importe um content.js gerado pelo editor.");
    }
  }

  function parseContent(text) {
    if (text.trim().startsWith("{")) {
      return JSON.parse(text);
    }

    const sandbox = {};
    const loader = new Function("window", `${text}\nreturn window.LIGA_RK_CONTENT;`);
    return loader(sandbox);
  }

  function buildFileContent() {
    Object.keys(state.divisions).forEach(syncLegacyVod);
    return `window.LIGA_RK_CONTENT = ${JSON.stringify(state, null, 2)};\n`;
  }

  function preparePlayerIdentitiesSafely() {
    try {
      return preparePlayerIdentities();
    } catch (error) {
      return {
        ok: false,
        error: `Não foi possível validar os jogadores: ${error && error.message ? error.message : "erro desconhecido"}.`
      };
    }
  }

  function preparePlayerIdentities() {
    if (!playerIdentity) {
      return { ok: false, error: "O modulo de identidade dos jogadores nao foi carregado." };
    }

    const invalid = [];
    const playerIdOwners = new Map();
    const duplicatePlayerIds = [];
    Object.entries(state.divisions).forEach(([divisionKey, division]) => {
      Object.entries(division.teams || {}).forEach(([slot, team]) => {
        (team.players || []).forEach((player, index) => {
          const registeredName = normalizeRosterPlayerName(player && (player.player || player.name));
          if (!registeredName) {
            team.players[index] = {
              ...player,
              lane: laneOrder[index] || player.lane || "SUB",
              player: "",
              opgg: "",
              captain: false,
              playerId: "",
              riotId: "",
              gameName: "",
              tagLine: "",
              riotIdAliases: []
            };
            return;
          }

          player.player = registeredName;
          const migrated = playerIdentity.migratePlayer(player, { lane: laneOrder[index] || player.lane });
          team.players[index] = migrated;
          const label = `${divisionLabels[divisionKey]} ${slot} ${migrated.player || migrated.name || `jogador ${index + 1}`}`;
          if (migrated.riotId && !playerIdentity.parseRiotId(migrated.riotId).valid) {
            invalid.push(label);
          }
          (migrated.riotIdAliases || []).forEach((alias) => {
            if (alias.riotId && !playerIdentity.parseRiotId(alias.riotId).valid) {
              invalid.push(`${label} (alternativo)`);
            }
          });
          if (migrated.playerId) {
            if (playerIdOwners.has(migrated.playerId)) {
              duplicatePlayerIds.push(label);
            } else {
              playerIdOwners.set(migrated.playerId, label);
            }
          }
        });
      });
    });

    identityConflicts = playerIdentity.collectConflicts(state);
    if (invalid.length) {
      return { ok: false, error: `Corrija o formato gameName#tagLine em: ${invalid.slice(0, 3).join(", ")}.` };
    }
    if (identityConflicts.length) {
      const examples = identityConflicts.slice(0, 3).map(formatIdentityConflict).join("; ");
      return {
        ok: false,
        error: `Publicação bloqueada por ${identityConflicts.length} Riot IDs duplicados: ${examples}. Remova o jogador repetido ou corrija o link do OP.GG marcado.`
      };
    }
    if (duplicatePlayerIds.length) {
      return { ok: false, error: "Existem identificadores internos duplicados. Nao publique antes de corrigir o cadastro." };
    }
    return { ok: true };
  }

  function normalizeRosterPlayerName(value) {
    const name = String(value || "").trim();
    return /^(?:jogador|player|-|--|sub|vaga dispon[ií]vel)$/i.test(name) ? "" : name;
  }

  function formatIdentityConflict(conflict) {
    const first = conflict && conflict.first || {};
    const second = conflict && conflict.second || {};
    const firstLabel = `${divisionLabels[first.division] || first.division || "Divisão"} ${first.slot || "?"} ${first.name || "jogador"}`;
    const secondLabel = `${divisionLabels[second.division] || second.division || "Divisão"} ${second.slot || "?"} ${second.name || "jogador"}`;
    return `${firstLabel} × ${secondLabel} (${conflict.riotId || conflict.normalizedRiotId || "Riot ID"})`;
  }

  function normalizeApiBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function field(label, path, value, placeholder, type = "text", min = "", max = "", maxlength = "") {
    return `
      <label class="editor-field">
        <span>${escapeHtml(label)}</span>
        ${input(path, value, placeholder, type, min, max, maxlength)}
      </label>
    `;
  }

  function input(path, value, placeholder, type = "text", min = "", max = "", maxlength = "") {
    const bounds = `${min !== "" ? ` min="${escapeAttribute(min)}"` : ""}${max !== "" ? ` max="${escapeAttribute(max)}"` : ""}${maxlength !== "" ? ` maxlength="${escapeAttribute(maxlength)}"` : ""}`;
    return `<input type="${escapeAttribute(type)}" data-path="${escapeAttribute(path)}" value="${escapeAttribute(value ?? "")}" placeholder="${escapeAttribute(placeholder || "")}"${bounds} />`;
  }

  function weekdaySelect(path, value) {
    const selected = normalizeWeekday(value);
    return `
      <select class="calendar-weekday-select" data-path="${escapeAttribute(path)}" aria-label="Dia da semana" title="Dia da semana">
        ${weekdayOptions.map((option) => `<option value="${option}" ${option === selected ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    `;
  }

  function renderImagePreview(path, label) {
    return path
      ? `<img src="${escapeAttribute(path)}" alt="${escapeAttribute(label || "Imagem")}" />`
      : `<span>sem imagem</span>`;
  }

  function setPath(path, value) {
    const parts = path.split(".");
    let target = state;

    parts.slice(0, -1).forEach((part) => {
      if (target[part] === undefined) {
        target[part] = {};
      }
      target = target[part];
    });

    target[parts[parts.length - 1]] = value;
  }

  function gameKey(roundIndex, gameIndex) {
    return `r${roundIndex + 1}g${gameIndex + 1}`;
  }

  function synchronizeAllReplayResults() {
    Object.keys(state.divisions || {}).forEach((key) => synchronizeReplayResults(key));
  }

  function synchronizeReplayResults(key) {
    const fixed = fixedData[key] || {};
    const division = state.divisions[key];
    const automaticTeams = replayDivision(key).teamSummaries || {};

    Object.entries(automaticTeams).forEach(([slot, team]) => {
      if (division.teams[slot] && team && team.avgWinTime && numeric(team.wins) > 0) {
        division.teams[slot].avgWinTime = team.avgWinTime;
      }
    });

    (fixed.rounds || []).forEach((round, roundIndex) => {
      (round.games || []).forEach((game, gameIndex) => {
        const normalized = normalizeGame(game);
        const resultKey = gameKey(roundIndex, gameIndex);
        const result = division.results[resultKey];
        const automatic = replaySeriesScore(key, `groups-${resultKey}`, normalized.home, normalized.away, 2);
        applyAutomaticScore(result, automatic, "homeScore", "awayScore");
      });
    });

    (fixed.playoffs || []).forEach((column, columnIndex) => {
      (column || []).forEach((match, matchIndex) => {
        const resultKey = playoffKey(columnIndex, matchIndex);
        const result = division.playoffResults[resultKey];
        const playoffState = computeEditorPlayoffState(key);
        const resolved = playoffState.matches[resultKey] || {};
        const maxScore = String(match.format).toUpperCase() === "MD5" ? 3 : 2;
        const automatic = replaySeriesScore(
          key,
          `playoffs-${resultKey}`,
          resolved.teamA && resolved.teamA.slot,
          resolved.teamB && resolved.teamB.slot,
          maxScore
        );
        applyAutomaticScore(result, automatic, "teamAScore", "teamBScore");
      });
    });
  }

  function replayDivision(key) {
    return replayStatsData.divisions && replayStatsData.divisions[key] || { matches: [], teamSummaries: {} };
  }

  function replaySeriesScore(key, seriesId, preferredTeamA, preferredTeamB, maxScore) {
    const matches = (replayDivision(key).matches || [])
      .filter((match) => match && match.seriesId === seriesId)
      .sort((left, right) => numeric(left.gameNumber) - numeric(right.gameNumber));
    if (!matches.length) {
      return null;
    }

    const first = matches[0];
    const teamA = preferredTeamA || first.blueTeamSlot || first.redTeamSlot;
    const teamB = preferredTeamB || [first.blueTeamSlot, first.redTeamSlot].find((slot) => slot && slot !== teamA);
    if (!teamA || !teamB || teamA === teamB) {
      return null;
    }

    const scoreA = Math.min(maxScore, matches.filter((match) => match.winnerSlot === teamA).length);
    const scoreB = Math.min(maxScore, matches.filter((match) => match.winnerSlot === teamB).length);
    return { scoreA, scoreB, teamA, teamB, games: matches.length };
  }

  function applyAutomaticScore(result, automatic, scoreAKey, scoreBKey) {
    if (!result || !automatic || result.manualOverride) {
      return;
    }
    result[scoreAKey] = automatic.scoreA;
    result[scoreBKey] = automatic.scoreB;
  }

  function markScoreManualOverride(path) {
    const calendar = /^divisions\.([^.]+)\.results\.([^.]+)\.(?:homeScore|awayScore)$/.exec(path);
    const playoffs = /^divisions\.([^.]+)\.playoffResults\.([^.]+)\.(?:teamAScore|teamBScore)$/.exec(path);
    const match = calendar || playoffs;
    if (!match) return;
    const collection = calendar ? "results" : "playoffResults";
    state.divisions[match[1]][collection][match[2]].manualOverride = true;
  }

  function resetScoreToReplay(button) {
    const key = button.dataset.scoreDivision;
    const collection = button.dataset.scoreReset === "calendar" ? "results" : "playoffResults";
    const result = state.divisions[key] && state.divisions[key][collection] && state.divisions[key][collection][button.dataset.scoreKey];
    if (!result) return;
    result.manualOverride = false;
    synchronizeReplayResults(key);
    rerenderPreservingOpenSections();
    markDirty();
  }

  function numeric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function playoffKey(columnIndex, matchIndex) {
    return `p${columnIndex + 1}m${matchIndex + 1}`;
  }

  function normalizeGame(game) {
    if (Array.isArray(game)) {
      return { time: game[0], home: game[1], away: game[2] };
    }
    return game;
  }

  function normalizeWeekday(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return weekdayOptions.includes(normalized) ? normalized : "";
  }

  function weekdayFromDate(value) {
    const match = /^(\d{1,2})\/(\d{1,2})$/.exec(String(value || "").trim());
    if (!match) return "";
    const labels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
    return labels[new Date(2026, Number(match[2]) - 1, Number(match[1])).getDay()] || "";
  }

  function computeEditorStandings(key) {
    const fixed = fixedData[key] || {};
    const division = state.divisions[key];
    if (!groupStandings) return {};
    return groupStandings.compute({
      rounds: fixed.rounds || [],
      resolveResult: (roundIndex, gameIndex) => division.results[gameKey(roundIndex, gameIndex)] || {},
      resolveTeam: (slot) => division.teams[slot]
    });
  }

  function computeEditorPlayoffState(key) {
    const fixed = fixedData[key] || {};
    const standings = computeEditorStandings(key);
    const matches = {};
    const winnersByTitle = {};

    (fixed.playoffs || []).forEach((column, columnIndex) => {
      (column || []).forEach((match, matchIndex) => {
        const resultKey = playoffKey(columnIndex, matchIndex);
        const result = state.divisions[key].playoffResults[resultKey] || {};
        const teamA = resolveEditorPlayoffTeam(key, standings, match.teamA, winnersByTitle);
        const teamB = resolveEditorPlayoffTeam(key, standings, match.teamB, winnersByTitle);
        const scoreA = parseSeriesScore(result.teamAScore);
        const scoreB = parseSeriesScore(result.teamBScore);
        const maxScore = String(match.format).toUpperCase() === "MD5" ? 3 : 2;

        if (scoreA === maxScore && scoreA > (scoreB ?? -1)) {
          storePlayoffWinner(winnersByTitle, match.title, teamA);
        } else if (scoreB === maxScore && scoreB > (scoreA ?? -1)) {
          storePlayoffWinner(winnersByTitle, match.title, teamB);
        }

        matches[resultKey] = { teamA, teamB };
      });
    });

    return { matches, winnersByTitle };
  }

  function resolveEditorPlayoffTeam(key, standings, reference, winnersByTitle) {
    const text = String(reference || "");
    const winnerMatch = /^VENCEDOR\s+(.+)$/i.exec(text);

    if (winnerMatch) {
      return getPlayoffWinner(winnersByTitle, winnerMatch[1]) || { text, slot: "" };
    }

    if (!/^[ABCD][1-4]$/.test(text)) {
      return { text, slot: "" };
    }

    const group = text[0];
    const position = Number(text[1]) - 1;
    const entry = standings[group] && standings[group][position];

    return entry ? { text: editorTeamName(key, entry.slot), slot: entry.slot } : { text, slot: "" };
  }

  function editorTeamName(key, slot) {
    const team = state.divisions[key].teams[slot];
    const name = team && String(team.name || "").trim();
    return name || slot;
  }

  function editorCalendarTeamName(team, slot) {
    const tag = team && String(team.tag || "").trim();
    return tag ? tag.slice(0, 4).toUpperCase() : slot;
  }

  function parseScore(value) {
    const text = String(value ?? "").trim();
    if (text === "") {
      return null;
    }

    const score = Number(text);
    return Number.isInteger(score) ? Math.max(0, Math.min(2, score)) : null;
  }

  function parseSeriesScore(value) {
    const text = String(value ?? "").trim();
    if (text === "") {
      return null;
    }

    const score = Number(text);
    return Number.isInteger(score) ? Math.max(0, score) : null;
  }

  function timeToSeconds(value) {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || "99:59").trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : 5999;
  }

  function storePlayoffWinner(winnersByTitle, title, team) {
    winnersByTitle[String(title || "")] = team;
    winnersByTitle[normalizePlayoffTitle(title)] = team;
  }

  function getPlayoffWinner(winnersByTitle, title) {
    return winnersByTitle[String(title || "")] || winnersByTitle[normalizePlayoffTitle(title)];
  }

  function normalizePlayoffTitle(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/^SEMIS\b/, "SEMI");
  }

  function normalizeVod(vod = {}) {
    const thumbnail = vod.thumbnail || youtubeThumbnail(vod.url);

    return {
      url: vod.url || "",
      title: vod.title || "",
      thumbnail
    };
  }

  function youtubeThumbnail(url) {
    const videoId = youtubeVideoId(url);
    return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : "";
  }

  function youtubeTitleFallback(url) {
    return youtubeVideoId(url) ? "VOD LIGA RK" : "TIME A X TIME B - R1 GRUPO A";
  }

  async function fetchYouTubeTitle(url) {
    if (!youtubeVideoId(url)) {
      return "";
    }

    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    return data.title || "";
  }

  function youtubeVideoId(url) {
    const text = String(url || "").trim();
    if (!text) {
      return "";
    }

    const patterns = [
      /(?:youtube\.com\/watch\?[^#]*v=)([A-Za-z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
      /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/
    ];
    const match = patterns.map((pattern) => pattern.exec(text)).find(Boolean);

    return match ? match[1] : "";
  }

  function markDirty() {
    setStatus("Alterações ainda não salvas no content.js.");
  }

  function setStatus(message) {
    if (String(message).includes("content.js") && String(message).toLowerCase().includes("salv")) {
      message = "Alteracoes ainda nao publicadas online.";
    }
    const status = document.getElementById("editor-status");
    if (status) {
      status.textContent = message;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
