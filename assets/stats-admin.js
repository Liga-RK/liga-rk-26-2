(function () {
  const app = document.getElementById("stats-admin-app");

  if (!app) {
    return;
  }

  const divisionLabels = {
    elite: "Elite",
    ascension: "Ascensao"
  };
  const state = {
    currentDivision: "elite",
    bootstrap: null,
    status: "Carregando painel..."
  };

  app.addEventListener("click", handleClick);
  app.addEventListener("change", handleChange);
  app.addEventListener("submit", handleSubmit);

  load();

  async function load() {
    try {
      const response = await fetch("/api/admin/bootstrap");
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Nao foi possivel carregar.");
      }
      state.bootstrap = data;
      state.status = data.hasApiKey
        ? "Pronto. Escolha a serie, os lados e envie o .rofl."
        : "Salve sua Riot API Key uma vez para automatizar a leitura dos jogos.";
      render();
    } catch (error) {
      renderServerError(error);
    }
  }

  function render() {
    if (!state.bootstrap) {
    app.innerHTML = shell(`<main class="editor-shell"><section class="editor-intro"><h1>Liga RK 26.2</h1><p>${escapeHtml(state.status)}</p></section></main>`);
      return;
    }

    const division = state.currentDivision;
    const computed = state.bootstrap.computed.divisions[division];
    const gamesById = Object.fromEntries((state.bootstrap.db.divisions[division].games || []).map((game) => [game.id, game]));

    app.innerHTML = shell(`
      <main class="editor-shell stats-admin-shell">
        <section class="editor-intro">
          <h1>Liga RK 26.2</h1>
          <p>Fluxo rapido: salve a API key uma vez, escolha a divisao e serie, selecione azul/vermelho, envie o .rofl e clique em salvar.</p>
          <form class="api-key-form" data-api-key-form>
            <label class="editor-field">
              <span>Riot API Key ${state.bootstrap.hasApiKey ? "(salva)" : ""}</span>
              <input name="apiKey" type="password" placeholder="RGAPI-..." autocomplete="off" />
            </label>
            <button type="submit">Salvar API Key</button>
            <button type="button" data-action="reprocess">Reprocessar jogos pendentes</button>
          </form>
          <nav class="editor-tabs" aria-label="Divisoes">
            ${Object.keys(divisionLabels)
              .map(
                (key) => `
                  <button type="button" class="${division === key ? "active" : ""}" data-stats-division="${key}">
                    ${divisionLabels[key]}
                  </button>
                `
              )
              .join("")}
          </nav>
          <p class="editor-status" aria-live="polite">${escapeHtml(state.status)}</p>
        </section>

        <section class="stats-admin-grid">
          <details class="editor-section stats-admin-section" open>
            <summary>Partidas e uploads</summary>
            <div class="series-list">
              ${(state.bootstrap.series[division] || []).map((series) => renderSeries(division, series, gamesById)).join("")}
            </div>
          </details>

          <details class="editor-section stats-admin-section" open>
            <summary>Estatisticas publicas</summary>
            ${renderPublicStatistics(computed.statistics)}
          </details>

          <details class="editor-section stats-admin-section" open>
            <summary>Dashboard partidas</summary>
            ${renderMatchesDashboard(division, computed.matches || [])}
          </details>

          <details class="editor-section stats-admin-section" open>
            <summary>Dashboard equipes</summary>
            ${renderTeamsDashboard(computed.teams || [])}
          </details>

          <details class="editor-section stats-admin-section" open>
            <summary>Dashboard jogadores</summary>
            ${renderPlayersDashboard(computed.players || [])}
          </details>
        </section>
      </main>
    `);
  }

  function shell(body) {
    return `
      <header class="editor-header">
        <a class="brand" href="index.html">
          <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg.png" alt="LIGA RK 26.2" />
          <span>Liga RK 26.2</span>
        </a>
      </header>
      ${body}
    `;
  }

  function renderServerError(error) {
    app.innerHTML = shell(`
      <main class="editor-shell">
        <section class="editor-intro">
          <h1>Servidor local necessario</h1>
          <p>Abra o arquivo <strong>iniciar_painel_estatisticas.bat</strong>. Ele inicia o servidor e abre este painel em localhost.</p>
          <p class="editor-status">${escapeHtml(error && error.message ? error.message : "")}</p>
        </section>
      </main>
    `);
  }

  function renderSeries(division, series, gamesById) {
    const teams = teamsForDivision(division);
    const title = formatSeriesTitle(series, teams);
    const versus = formatVersus(series.teamARef, series.teamBRef, teams);
    return `
      <article class="editor-card series-card">
        <header class="series-card-header">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <span>${escapeHtml(series.subtitle)} | ${escapeHtml(series.stage)} | ${series.maxGames} jogos</span>
          </div>
          <span>${escapeHtml(versus)}</span>
        </header>
        <div class="series-game-list">
          ${Array.from({ length: series.maxGames }, (_, index) => {
            const gameNumber = index + 1;
            const gameId = `${series.id}-j${gameNumber}`;
            return renderGameSlot(division, series, gameNumber, gamesById[gameId]);
          }).join("")}
        </div>
      </article>
    `;
  }

  function renderGameSlot(division, series, gameNumber, game) {
    const teams = teamsForDivision(division);
    const matchId = game && game.matchId ? game.matchId : game && game.match && game.match.gameId ? game.match.gameId : "";
    const summary = game && game.match ? summarizeGame(game) : null;

    return `
      <form class="game-slot" data-game-form data-division="${escapeAttribute(division)}" data-series-id="${escapeAttribute(series.id)}" data-game-number="${gameNumber}">
        <div class="game-slot-main">
          <strong>Jogo ${gameNumber}</strong>
          <label>
            <span>Azul</span>
            <select name="blueTeamSlot">
              ${renderTeamOptions(teams, game && game.blueTeamSlot)}
            </select>
          </label>
          <label>
            <span>Vermelho</span>
            <select name="redTeamSlot">
              ${renderTeamOptions(teams, game && game.redTeamSlot)}
            </select>
          </label>
          <label>
            <span>Match ID se precisar</span>
            <input name="matchId" value="${escapeAttribute(matchId)}" placeholder="BR1_1234567890" />
          </label>
          <label class="file-button inline-file-button">
            Replay .rofl
            <input type="file" name="rofl" accept=".rofl" />
          </label>
          <button type="submit">Salvar jogo</button>
          ${game ? `<button class="danger-button" type="button" data-action="delete-game" data-game-id="${escapeAttribute(game.id)}" data-division="${escapeAttribute(division)}">Remover</button>` : ""}
        </div>
        <div class="game-slot-status">
          ${game ? renderGameStatus(game, summary) : "<span>Nenhum replay registrado.</span>"}
        </div>
      </form>
    `;
  }

  function renderTeamOptions(teams, selected) {
    return `
      <option value="">Escolher time</option>
      ${teams
        .map(
          (team) => `
            <option value="${escapeAttribute(team.slot)}" ${team.slot === selected ? "selected" : ""}>
              ${escapeHtml(team.name || team.tag || team.slot)}${team.tag && team.tag !== team.name ? ` (${escapeHtml(team.tag)})` : ""}
            </option>
          `
        )
        .join("")}
    `;
  }

  function renderGameStatus(game, summary) {
    const rofl = game.rofl
      ? `${game.rofl.originalName || "replay.rofl"} (${formatBytes(game.rofl.size || 0)})`
      : "sem .rofl";
    const parsed = summary
      ? `${summary.winnerTeam} venceu | ${summary.duration} | gold ${signed(summary.goldDiff)} | kills ${signed(summary.killsDiff)}`
      : "aguardando processamento";

    return `
      <span>${escapeHtml(rofl)}</span>
      <span>Status: ${escapeHtml(game.parserStatus || "empty")}</span>
      ${game.matchId ? `<span>Match ID: ${escapeHtml(game.matchId)}</span>` : ""}
      <span>${escapeHtml(parsed)}</span>
      ${game.parserError ? `<span class="status-error">${escapeHtml(game.parserError)}</span>` : ""}
    `;
  }

  function renderPublicStatistics(statistics) {
    if (!statistics) {
      return emptyDashboard("Nenhuma estatistica publica calculada ainda.");
    }

    return `
      <div class="public-stats-preview">
        ${renderPublicChampionStat(statistics.mostPicked)}
        ${renderPublicChampionStat(statistics.mostWins)}
        ${(statistics.playerStats || []).map(renderPublicPlayerStat).join("")}
      </div>
    `;
  }

  function renderPublicChampionStat(stat = {}) {
    return `
      <article class="public-stat-card champion">
        ${stat.image ? `<img src="${escapeAttribute(stat.image)}" alt="" />` : ""}
        <div>
          <span>${escapeHtml(stat.title || "CAMPEAO")}</span>
          <strong>${escapeHtml(stat.champion || "-")}</strong>
        </div>
        <b>${escapeHtml(stat.value ?? 0)}</b>
      </article>
    `;
  }

  function renderPublicPlayerStat(stat = {}) {
    return `
      <article class="public-stat-card">
        <div>
          <span>${escapeHtml(stat.label || "ESTATISTICA")}</span>
          <strong>${escapeHtml(stat.player || "-")}</strong>
        </div>
        <b>${escapeHtml(stat.value || "0")}</b>
      </article>
    `;
  }

  function renderMatchesDashboard(division, matches) {
    if (!matches.length) {
      return emptyDashboard("Nenhuma partida processada ainda.");
    }

    return `
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Jogo</th>
              <th>Resultado</th>
              <th>Vencedor</th>
              <th>Derrotado</th>
              <th>Duracao</th>
              <th>Gold</th>
              <th>Kills</th>
              <th>MVP</th>
            </tr>
          </thead>
          <tbody>
            ${matches
              .map(
                (match) => `
                  <tr>
                    <td>${escapeHtml(matchLabel(division, match))}</td>
                    <td>${escapeHtml(match.result)}</td>
                    <td>${escapeHtml(match.winnerTeam)}</td>
                    <td>${escapeHtml(match.loserTeam)}</td>
                    <td>${escapeHtml(match.duration)}</td>
                    <td>${escapeHtml(signed(match.goldDiff))}</td>
                    <td>${escapeHtml(signed(match.killsDiff))}</td>
                    <td>${escapeHtml(match.mvp || "-")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTeamsDashboard(teams) {
    const activeTeams = teams.filter((team) => team.games);
    if (!activeTeams.length) {
      return emptyDashboard("Nenhuma estatistica de equipe calculada ainda.");
    }

    return `
      <div class="team-analytics-grid">
        ${activeTeams
          .map(
            (team) => `
              <article class="team-analytics-card">
                <header>
                  ${team.logo ? `<img src="${escapeAttribute(team.logo)}" alt="" />` : `<span class="team-mark" aria-hidden="true"></span>`}
                  <strong>${escapeHtml(team.name || team.slot)}</strong>
                  <span>${escapeHtml(team.tag || team.slot)}</span>
                </header>
                <div><span>Vitorias</span><strong>${team.wins}</strong></div>
                <div><span>Derrotas</span><strong>${team.losses}</strong></div>
                <div><span>Duracao media da vitoria</span><strong>${escapeHtml(team.avgWinTime)}</strong></div>
                <div><span>Kills media</span><strong>${formatNumber(team.killsAvg)}</strong></div>
                <div><span>Deaths media</span><strong>${formatNumber(team.deathsAvg)}</strong></div>
                <div><span>Assists media</span><strong>${formatNumber(team.assistsAvg)}</strong></div>
                <div><span>GPM medio</span><strong>${formatNumber(team.gpmAvg)}</strong></div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderPlayersDashboard(players) {
    if (!players.length) {
      return emptyDashboard("Nenhum jogador processado ainda.");
    }

    return `
      <div class="stats-table-wrap">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Jogador</th>
              <th>Lane</th>
              <th>Equipe</th>
              <th>Campeoes jogados</th>
              <th>K</th>
              <th>D</th>
              <th>A</th>
              <th>KP%</th>
              <th>GPM</th>
              <th>DPM</th>
              <th>VPM</th>
              <th>MVPs</th>
            </tr>
          </thead>
          <tbody>
            ${players
              .map(
                (player) => `
                  <tr>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${escapeHtml(player.lane)}</td>
                    <td>${escapeHtml(teamLabel(player.teamSlot))}</td>
                    <td>${escapeHtml(player.champions.map((champion) => `${champion.champion} (${champion.count})`).join(", "))}</td>
                    <td>${player.kills}</td>
                    <td>${player.deaths}</td>
                    <td>${player.assists}</td>
                    <td>${formatNumber(player.kp)}</td>
                    <td>${formatNumber(player.gpm)}</td>
                    <td>${formatNumber(player.dpm)}</td>
                    <td>${formatNumber(player.vpm)}</td>
                    <td>${player.mvps}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function handleSubmit(event) {
    const apiKeyForm = event.target.closest("[data-api-key-form]");
    const gameForm = event.target.closest("[data-game-form]");

    if (apiKeyForm) {
      event.preventDefault();
      await saveApiKey(apiKeyForm);
      return;
    }

    if (gameForm) {
      event.preventDefault();
      await saveGame(gameForm);
    }
  }

  async function handleClick(event) {
    const divisionButton = event.target.closest("[data-stats-division]");
    const actionButton = event.target.closest("[data-action]");

    if (divisionButton) {
      state.currentDivision = divisionButton.dataset.statsDivision;
      render();
      return;
    }

    if (!actionButton) {
      return;
    }

    if (actionButton.dataset.action === "delete-game") {
      await deleteGame(actionButton);
    }

    if (actionButton.dataset.action === "reprocess") {
      await reprocessGames();
    }
  }

  function handleChange(event) {
    if (event.target.matches("input[type='file']")) {
      const label = event.target.closest(".file-button");
      const file = event.target.files && event.target.files[0];
      if (label && file) {
        label.dataset.fileName = file.name;
      }
    }

    const form = event.target.closest("[data-game-form]");
    if (form) {
      form.classList.add("dirty");
    }
  }

  async function saveApiKey(form) {
    const apiKey = form.elements.apiKey.value.trim();
    if (!apiKey) {
      setStatus("Cole uma Riot API Key valida.");
      return;
    }

    setStatus("Salvando API key...");
    const result = await postJson("/api/admin/api-key", { apiKey });
    state.status = result.ok ? "API key salva. Agora os uploads podem ser processados automaticamente." : result.error || "Nao foi possivel salvar.";
    await load();
  }

  async function saveGame(form) {
    setStatus("Enviando replay e processando...");
    const roflFile = form.elements.rofl.files && form.elements.rofl.files[0];
    const payload = {
      division: form.dataset.division,
      seriesId: form.dataset.seriesId,
      gameNumber: Number(form.dataset.gameNumber),
      blueTeamSlot: form.elements.blueTeamSlot.value,
      redTeamSlot: form.elements.redTeamSlot.value,
      matchId: form.elements.matchId.value,
      fileName: roflFile ? roflFile.name : "",
      fileBase64: roflFile ? await fileToBase64(roflFile) : "",
      matchJson: ""
    };
    const result = await postJson("/api/admin/game", payload);
    state.status = result.ok ? "Jogo salvo. Banco e estatisticas do site foram atualizados." : result.error || "Nao foi possivel salvar.";
    await load();
  }

  async function deleteGame(button) {
    setStatus("Removendo jogo...");
    const result = await postJson("/api/admin/delete-game", {
      division: button.dataset.division,
      gameId: button.dataset.gameId
    });
    state.status = result.ok ? "Jogo removido. Estatisticas atualizadas." : result.error || "Nao foi possivel remover.";
    await load();
  }

  async function reprocessGames() {
    setStatus("Reprocessando jogos pendentes...");
    const result = await postJson("/api/admin/reprocess", {});
    state.status = result.ok ? "Reprocessamento concluido." : result.error || "Nao foi possivel reprocessar.";
    await load();
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  function teamsForDivision(division) {
    const contentDivision = state.bootstrap.content.divisions && state.bootstrap.content.divisions[division];
    const teams = contentDivision && contentDivision.teams ? contentDivision.teams : {};
    const slots = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "D4"];

    return slots.map((slot) => ({
      slot,
      name: teams[slot] && teams[slot].name ? teams[slot].name : slot,
      tag: teams[slot] && teams[slot].tag ? teams[slot].tag : slot,
      logo: teams[slot] && teams[slot].logo ? teams[slot].logo : ""
    }));
  }

  function teamLabel(slot) {
    const team = teamsForDivision(state.currentDivision).find((item) => item.slot === slot);
    return team ? team.name || team.slot : slot || "-";
  }

  function formatSeriesTitle(series, teams) {
    const parts = String(series.title || "").split(" - ");
    if (parts.length < 2) {
      return series.title || "";
    }
    return `${parts[0]} - ${formatVersus(series.teamARef, series.teamBRef, teams)}`;
  }

  function formatVersus(teamARef, teamBRef, teams) {
    return `${teamNameFromRef(teamARef, teams)} x ${teamNameFromRef(teamBRef, teams)}`;
  }

  function teamNameFromRef(ref, teams) {
    const value = String(ref || "");
    const team = teams.find((item) => item.slot === value);
    if (!team) {
      return value;
    }
    return team.name && team.name !== team.slot ? team.name : team.tag || team.slot;
  }

  function matchLabel(division, match) {
    const series = (state.bootstrap.series[division] || []).find((item) => item.id === match.seriesId);
    if (!series) {
      return match.id || "";
    }
    const teams = teamsForDivision(division);
    return `${formatSeriesTitle(series, teams)} - Jogo ${match.gameNumber || ""}`.trim();
  }

  function summarizeGame(game) {
    const match = game.match;
    const winner = match.winnerSide === "blue" ? match.teams.blue : match.teams.red;
    const loser = match.winnerSide === "blue" ? match.teams.red : match.teams.blue;
    return {
      winnerTeam: winner.name || winner.slot,
      duration: formatTime(match.durationSeconds),
      goldDiff: Math.round((winner.gold || 0) - (loser.gold || 0)),
      killsDiff: Math.round((winner.kills || 0) - (loser.kills || 0))
    };
  }

  function emptyDashboard(text) {
    return `<div class="empty-dashboard">${escapeHtml(text)}</div>`;
  }

  function setStatus(text) {
    state.status = text;
    const status = app.querySelector(".editor-status");
    if (status) {
      status.textContent = text;
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    if (value > 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }

  function formatNumber(value) {
    return (Number(value) || 0).toFixed(2);
  }

  function signed(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
  }

  function escapeHtml(value) {
    return String(value ?? "")
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
