(function () {
  "use strict";

  const app = document.getElementById("stats-admin-app");
  if (!app) return;

  const state = {
    bootstrap: null,
    currentDivision: "elite",
    preview: null,
    status: ""
  };

  app.addEventListener("submit", handleSubmit);
  app.addEventListener("click", handleClick);
  app.addEventListener("change", handleChange);
  app.addEventListener("dragover", handleDragOver);
  app.addEventListener("drop", handleDrop);
  load();

  async function load() {
    try {
      const response = await fetch("/api/admin/bootstrap", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Nao foi possivel abrir o painel.");
      state.bootstrap = payload;
      render();
    } catch (error) {
      renderServerError(error);
    }
  }

  function render() {
    const division = state.currentDivision;
    const divisionDb = state.bootstrap.db.divisions[division] || { games: [] };
    const gamesById = Object.fromEntries((divisionDb.games || []).map((game) => [game.id, game]));
    const computed = state.bootstrap.computed.divisions[division] || {};
    app.innerHTML = shell(`
      <main class="editor-shell stats-admin-shell">
        <section class="editor-intro">
          <p class="stats-admin-kicker">Painel local e privado</p>
          <h1>Replays e estatisticas</h1>
          <p>Importe o arquivo ROFL2, revise os lados e relacione cada Riot ID a um jogador inscrito antes de salvar.</p>
          <nav class="editor-tabs" aria-label="Divisoes">
            <button type="button" class="${division === "elite" ? "active" : ""}" data-stats-division="elite">Elite</button>
            <button type="button" class="${division === "ascension" ? "active" : ""}" data-stats-division="ascension">Ascensao</button>
          </nav>
          <p class="editor-status" aria-live="polite">${escapeHtml(state.status || `Cadastros carregados da fonte ${state.bootstrap.contentSource}.`)}</p>
        </section>

        ${state.preview ? renderPreview(state.preview) : ""}

        <section class="stats-admin-grid">
          <details class="editor-section stats-admin-section" open>
            <summary>Partidas da ${division === "elite" ? "Elite" : "Ascensao"}</summary>
            <p class="stats-admin-help">Cada espaco representa um jogo da serie. O replay so e salvo depois da pre-visualizacao e da sua confirmacao.</p>
            <div class="series-list">
              ${(state.bootstrap.series[division] || []).map((series) => renderSeries(division, series, gamesById)).join("")}
            </div>
          </details>

          <details class="editor-section stats-admin-section">
            <summary>Estatisticas calculadas</summary>
            ${renderOverview(computed)}
          </details>

          <details class="editor-section stats-admin-section">
            <summary>Jogos processados</summary>
            ${renderMatchesDashboard(division, computed.matches || [])}
          </details>

          <details class="editor-section stats-admin-section">
            <summary>Equipes</summary>
            ${renderTeamsDashboard(computed.teams || [])}
          </details>

          <details class="editor-section stats-admin-section">
            <summary>Jogadores</summary>
            ${renderPlayersDashboard(computed.players || [])}
          </details>

          <details class="editor-section stats-admin-section">
            <summary>Riot IDs alternativos</summary>
            ${renderAliasesDashboard(division, state.bootstrap.db.playerAliases || [])}
          </details>

          <div class="editor-action-row stats-admin-footer-actions">
            <button type="button" data-action="reprocess">Reprocessar todos os replays</button>
          </div>
        </section>
      </main>
    `);
  }

  function shell(body) {
    return `
      <header class="editor-header">
        <a class="brand" href="index.html">
          <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="LIGA RK 26.2" />
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
          <p>Abra <strong>iniciar_painel_estatisticas.bat</strong>. O painel administrativo funciona somente no seu computador.</p>
          <p class="editor-status">${escapeHtml(error && error.message ? error.message : "")}</p>
        </section>
      </main>
    `);
  }

  function renderSeries(division, series, gamesById) {
    const teams = teamsForDivision(division);
    return `
      <article class="editor-card series-card">
        <header class="series-card-header">
          <div>
            <h3>${escapeHtml(formatSeriesTitle(series, teams))}</h3>
            <span>${escapeHtml(series.subtitle)} | ${escapeHtml(series.stage)} | ate ${series.maxGames} jogos</span>
          </div>
          <span>${escapeHtml(formatVersus(series.teamARef, series.teamBRef, teams))}</span>
        </header>
        <div class="series-game-list">
          ${Array.from({ length: series.maxGames }, (_, index) => {
            const gameNumber = index + 1;
            return renderGameSlot(division, series, gameNumber, gamesById[`${series.id}-j${gameNumber}`]);
          }).join("")}
        </div>
      </article>
    `;
  }

  function renderGameSlot(division, series, gameNumber, game) {
    const teams = teamsForDivision(division).filter((team) => team.configured);
    return `
      <form class="game-slot rofl-upload-slot" data-game-form data-division="${escapeAttribute(division)}" data-series-id="${escapeAttribute(series.id)}" data-game-number="${gameNumber}">
        <div class="game-slot-main">
          <strong class="game-slot-number">Jogo ${gameNumber}</strong>
          <label class="game-slot-blue">
            <span>TEAM 100 - lado azul</span>
            <select name="blueTeamSlot" required>${renderTeamOptions(teams, game && game.blueTeamSlot)}</select>
          </label>
          <label class="game-slot-red">
            <span>TEAM 200 - lado vermelho</span>
            <select name="redTeamSlot" required>${renderTeamOptions(teams, game && game.redTeamSlot)}</select>
          </label>
          <label class="rofl-dropzone" data-dropzone>
            <span>Arquivo .rofl</span>
            <b>Arraste aqui ou escolha o replay</b>
            <small data-file-name>${game && game.replay ? game.replay.originalName : "Limite: 40 MB"}</small>
            <input type="file" name="rofl" accept=".rofl" required />
          </label>
          <button class="game-slot-process" type="submit">Processar e revisar</button>
          ${game ? `<button class="danger-button game-slot-delete" type="button" data-action="delete-game" data-game-id="${escapeAttribute(game.id)}" data-division="${escapeAttribute(division)}">Remover jogo</button>` : ""}
        </div>
        <div class="game-slot-status">${game ? renderGameStatus(game) : "<span>Nenhum replay salvo neste jogo.</span>"}</div>
      </form>
    `;
  }

  function renderPreview(preview) {
    const replay = preview.replay;
    const winner = replay.winnerTeam === 100 ? preview.teams["100"].name : preview.teams["200"].name;
    return `
      <section class="replay-preview-panel" id="replay-preview">
        <header class="replay-preview-header">
          <div>
            <span>Pre-visualizacao nao salva</span>
            <h2>${escapeHtml(preview.file.name)}</h2>
          </div>
          <button type="button" class="danger-button" data-action="discard-preview">Descartar</button>
        </header>

        <div class="replay-summary-grid">
          ${summaryMetric("Versao", replay.clientVersion || "-")}
          ${summaryMetric("Duracao", formatDuration(replay.durationSeconds))}
          ${summaryMetric("Hash", preview.file.sha256Short)}
          ${summaryMetric("Vencedor", winner || `TEAM ${replay.winnerTeam}`)}
        </div>

        ${preview.duplicates.length ? `
          <div class="replay-warning duplicate-warning">
            Ja existe registro relacionado a este replay ou a este jogo: ${preview.duplicates.map((item) => `${item.division}/${item.gameId} (${item.reasons.join(", ")})`).join("; ")}.
          </div>
        ` : ""}
        ${(replay.warnings || []).length ? `<div class="replay-warning">${replay.warnings.map(escapeHtml).join("<br />")}</div>` : ""}

        <div class="replay-side-grid">
          ${renderPreviewSide(preview, 100)}
          ${renderPreviewSide(preview, 200)}
        </div>

        <div class="replay-confirm-box">
          <label class="captain-toggle">
            <input type="checkbox" data-confirm-sides />
            Confirmo que TEAM 100 e ${escapeHtml(preview.teams["100"].name)} e TEAM 200 e ${escapeHtml(preview.teams["200"].name)}.
          </label>
          ${preview.duplicates.length ? `
            <label class="captain-toggle danger-confirm">
              <input type="checkbox" data-replace-existing />
              Substituir conscientemente o registro existente indicado acima.
            </label>
          ` : ""}
          <button type="button" data-action="confirm-preview">Confirmar replay e salvar estatisticas</button>
        </div>
      </section>
    `;
  }

  function renderPreviewSide(preview, teamNumber) {
    const key = String(teamNumber);
    const team = preview.teams[key];
    const totals = preview.replay.teams[key];
    const participants = preview.replay.participants.filter((participant) => participant.team === teamNumber);
    return `
      <article class="replay-side-card ${teamNumber === 100 ? "blue" : "red"}">
        <header>
          ${team.logo ? `<img src="${escapeAttribute(normalizeAssetPath(team.logo))}" alt="" />` : ""}
          <div><span>TEAM ${teamNumber}</span><strong>${escapeHtml(team.name)}</strong></div>
          <b>${totals.kills}/${totals.deaths}/${totals.assists}</b>
        </header>
        <div class="replay-team-totals">
          <span>Ouro ${totals.gold}</span><span>Dano ${totals.damageToChampions}</span><span>Torres ${totals.towers}</span><span>Dragoes ${totals.dragons}</span><span>Arautos ${totals.heralds}</span><span>Baroes ${totals.barons}</span>
        </div>
        <div class="replay-participant-list">
          ${participants.map((participant) => renderParticipantMapping(preview, participant, team)).join("")}
        </div>
      </article>
    `;
  }

  function renderParticipantMapping(preview, participant, team) {
    const suggestion = preview.suggestions.find((item) => item.participantIndex === participant.participantIndex) || {};
    const selected = suggestion.playerId ? `player:${suggestion.playerId}` : "status:unresolved";
    return `
      <div class="replay-participant-row" data-participant-index="${participant.participantIndex}">
        <div class="replay-participant-main">
          <strong>${escapeHtml(participant.riotId)}</strong>
          <span>${escapeHtml(participant.position || "-")} | ${escapeHtml(participant.champion)} | ${participant.kills}/${participant.deaths}/${participant.assists}</span>
          <small>Ouro ${participant.gold} | Dano ${participant.damageToChampions}</small>
        </div>
        <label>
          <span>Jogador inscrito</span>
          <select data-player-mapping>${renderPlayerOptions(team.players || [], selected)}</select>
        </label>
        <label class="captain-toggle save-alias-toggle">
          <input type="checkbox" data-save-alias ${suggestion.playerId ? "" : "disabled"} />
          Salvar Riot ID como alias
        </label>
        <span class="mapping-status">${escapeHtml(mappingStatusLabel(suggestion.identificationMethod))}</span>
      </div>
    `;
  }

  function renderPlayerOptions(players, selected) {
    return `
      <option value="status:unresolved" ${selected === "status:unresolved" ? "selected" : ""}>Nao identificado / pendente</option>
      <option value="status:guest">Convidado nao inscrito</option>
      <option value="status:substitute">Substituto nao inscrito</option>
      ${players.map((player) => `
        <option value="player:${escapeAttribute(player.playerId)}" ${selected === `player:${player.playerId}` ? "selected" : ""} ${player.playerId ? "" : "disabled"}>
          ${escapeHtml(player.name)} - ${escapeHtml(player.lane)}${player.riotId ? ` (${escapeHtml(player.riotId)})` : " (sem Riot ID)"}
        </option>
      `).join("")}
    `;
  }

  function renderTeamOptions(teams, selected) {
    return `<option value="">Escolher time</option>${teams.map((team) => `
      <option value="${escapeAttribute(team.slot)}" ${team.slot === selected ? "selected" : ""}>${escapeHtml(team.name)} (${escapeHtml(team.tag || team.slot)})</option>
    `).join("")}`;
  }

  function renderGameStatus(game) {
    const match = game.match || {};
    const winnerSlot = Number(match.winnerTeam) === 100 ? game.blueTeamSlot : game.redTeamSlot;
    return `
      <span>${escapeHtml(game.replay && game.replay.originalName || "replay.rofl")}</span>
      <span>Status: ${escapeHtml(game.parserStatus || "-")}</span>
      <span>Parser: ${escapeHtml(game.parserVersion || "-")}</span>
      <span>Atualizado: ${escapeHtml(formatDateTime(game.updatedAt))}</span>
      <span>${escapeHtml(teamLabel(winnerSlot))} venceu | ${escapeHtml(formatDuration(match.durationSeconds))}</span>
      ${(game.warnings || []).map((warning) => `<span class="status-warning">${escapeHtml(warning)}</span>`).join("")}
      ${game.parserError ? `<span class="status-error">${escapeHtml(game.parserError)}</span>` : ""}
      <button type="button" class="status-action" data-action="reprocess-game" data-game-id="${escapeAttribute(game.id)}" data-division="${escapeAttribute(game.division)}">Reprocessar este replay</button>
    `;
  }

  function renderOverview(computed) {
    if (!computed.hasData) return emptyDashboard("Nenhuma estatistica calculada ainda.");
    return `
      <div class="replay-summary-grid">
        ${summaryMetric("Partidas", computed.overview.games)}
        ${summaryMetric("Equipes", computed.overview.teams)}
        ${summaryMetric("Jogadores", computed.overview.players)}
        ${summaryMetric("Campeoes", computed.overview.champions)}
      </div>
      ${renderHeadlineStats(computed.statistics)}
    `;
  }

  function renderHeadlineStats(statistics) {
    if (!statistics) return "";
    return `<div class="public-stats-preview">
      ${renderHeadlineChampion(statistics.mostPicked)}
      ${renderHeadlineChampion(statistics.mostWins)}
      ${(statistics.playerStats || []).map((stat) => `<article class="public-stat-card"><div><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.player)}</strong></div><b>${escapeHtml(stat.value)}</b></article>`).join("")}
    </div>`;
  }

  function renderHeadlineChampion(stat) {
    return `<article class="public-stat-card champion">${stat.image ? `<img src="${escapeAttribute(stat.image)}" alt="" />` : ""}<div><span>${escapeHtml(stat.title)}</span><strong>${escapeHtml(stat.champion)}</strong></div><b>${escapeHtml(stat.value)}</b></article>`;
  }

  function renderMatchesDashboard(division, matches) {
    if (!matches.length) return emptyDashboard("Nenhuma partida processada ainda.");
    return table(["Jogo", "Azul", "Vermelho", "Duracao", "Gold", "Kills", "MVP"], matches.map((match) => [
      matchLabel(division, match), match.blueTeam.name, match.redTeam.name, match.duration, signed(match.goldDiff), signed(match.killsDiff), match.mvp && match.mvp.riotId || "-"
    ]));
  }

  function renderTeamsDashboard(teams) {
    const active = teams.filter((team) => team.games);
    if (!active.length) return emptyDashboard("Nenhuma equipe possui partidas processadas.");
    return table(["Equipe", "J", "V", "D", "WR", "KDA", "GPM", "Tempo medio de vitoria"], active.map((team) => [team.name, team.games, team.wins, team.losses, `${team.winRate}%`, team.kda, team.gpmAvg, team.avgWinTime]));
  }

  function renderPlayersDashboard(players) {
    if (!players.length) return emptyDashboard("Nenhum jogador processado ainda.");
    return table(["Jogador", "Riot ID", "Lane", "J", "V", "KDA", "KP", "GPM", "DPM", "MVP"], players.map((player) => [
      player.displayName, player.riotId, player.mainPosition, player.games, player.wins, player.kda, `${player.kp}%`, player.gpm, player.dpm, player.mvps
    ]));
  }

  function renderAliasesDashboard(division, aliases) {
    const directory = playerDirectory(division);
    const active = aliases.filter((alias) => alias.active !== false && directory.has(alias.playerId));
    if (!active.length) return emptyDashboard("Nenhum Riot ID alternativo salvo nesta divisao.");
    return `<div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>Jogador</th><th>Riot ID alternativo</th><th>Origem</th><th>Adicionado</th><th></th></tr></thead><tbody>${active.map((alias) => {
      const player = directory.get(alias.playerId);
      return `<tr><td>${escapeHtml(player.name)}</td><td>${escapeHtml(alias.riotId)}</td><td>${escapeHtml(alias.sourceMatchId || alias.source || "-")}</td><td>${escapeHtml(formatDateTime(alias.addedAt))}</td><td class="alias-action-cell"><button type="button" class="danger-button" data-action="delete-alias" data-alias-id="${escapeAttribute(alias.id)}">Desativar</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function table(headers, rows) {
    return `<div class="stats-table-wrap"><table class="stats-table"><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${escapeHtml(item)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  async function handleSubmit(event) {
    const form = event.target.closest("[data-game-form]");
    if (!form) return;
    event.preventDefault();
    await processReplay(form);
  }

  async function handleClick(event) {
    const divisionButton = event.target.closest("[data-stats-division]");
    const actionButton = event.target.closest("[data-action]");
    if (divisionButton) {
      state.currentDivision = divisionButton.dataset.statsDivision;
      state.preview = null;
      render();
      return;
    }
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === "discard-preview") {
      state.preview = null;
      render();
    } else if (action === "confirm-preview") {
      await confirmPreview();
    } else if (action === "delete-game") {
      await deleteGame(actionButton);
    } else if (action === "delete-alias") {
      await deleteAlias(actionButton);
    } else if (action === "reprocess-game") {
      await reprocessGame(actionButton);
    } else if (action === "reprocess") {
      await reprocessGames();
    }
  }

  function handleChange(event) {
    if (event.target.matches("input[type='file']")) updateFileLabel(event.target);
    if (event.target.matches("[data-player-mapping]")) {
      const row = event.target.closest("[data-participant-index]");
      const alias = row && row.querySelector("[data-save-alias]");
      if (alias) {
        alias.disabled = !event.target.value.startsWith("player:");
        if (alias.disabled) alias.checked = false;
      }
    }
  }

  function handleDragOver(event) {
    const zone = event.target.closest("[data-dropzone]");
    if (!zone) return;
    event.preventDefault();
    zone.classList.add("dragging");
  }

  function handleDrop(event) {
    const zone = event.target.closest("[data-dropzone]");
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove("dragging");
    const input = zone.querySelector("input[type='file']");
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (input && file) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      updateFileLabel(input);
    }
  }

  async function processReplay(form) {
    const file = form.elements.rofl.files && form.elements.rofl.files[0];
    if (!file) return setStatus("Selecione o arquivo .rofl.");
    if (file.size > 40 * 1024 * 1024) return setStatus("O replay excede o limite de 40 MB.");
    setStatus("Processando o replay localmente...");
    try {
      const result = await postJson("/api/admin/replay/preview", {
        division: form.dataset.division,
        seriesId: form.dataset.seriesId,
        gameNumber: Number(form.dataset.gameNumber),
        blueTeamSlot: form.elements.blueTeamSlot.value,
        redTeamSlot: form.elements.redTeamSlot.value,
        fileName: file.name,
        fileBase64: await fileToBase64(file)
      });
      state.preview = result.preview;
      state.status = "Replay processado. Revise todos os dados antes de confirmar.";
      render();
      document.getElementById("replay-preview").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function confirmPreview() {
    const panel = document.getElementById("replay-preview");
    if (!panel || !state.preview) return;
    const confirmSides = panel.querySelector("[data-confirm-sides]").checked;
    const replace = panel.querySelector("[data-replace-existing]");
    const mappings = Array.from(panel.querySelectorAll("[data-participant-index]")).map((row) => {
      const value = row.querySelector("[data-player-mapping]").value;
      const playerId = value.startsWith("player:") ? value.slice(7) : "";
      const suggestion = state.preview.suggestions.find((item) => item.participantIndex === Number(row.dataset.participantIndex));
      return {
        participantIndex: Number(row.dataset.participantIndex),
        playerId,
        status: playerId ? "identified" : value.slice(7),
        identificationMethod: playerId && suggestion && suggestion.playerId === playerId ? suggestion.identificationMethod : playerId ? "manual" : "unresolved",
        saveAsAlias: Boolean(playerId && row.querySelector("[data-save-alias]").checked)
      };
    });
    setStatus("Salvando replay e recalculando estatisticas...");
    try {
      await postJson("/api/admin/replay/confirm", {
        previewId: state.preview.previewId,
        confirmSides,
        replaceExisting: Boolean(replace && replace.checked),
        mappings
      });
      state.preview = null;
      state.status = "Replay salvo. Estatisticas publicas foram regeneradas.";
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deleteGame(button) {
    if (!window.confirm("Remover esta partida das estatisticas? A inscricao e os times nao serao alterados.")) return;
    try {
      await postJson("/api/admin/delete-game", { division: button.dataset.division, gameId: button.dataset.gameId });
      state.status = "Partida removida e estatisticas reconstruidas.";
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deleteAlias(button) {
    if (!window.confirm("Desativar este Riot ID alternativo? As partidas ja salvas e o historico do jogador serao preservados.")) return;
    try {
      await postJson("/api/admin/delete-alias", { aliasId: button.dataset.aliasId });
      state.status = "Riot ID alternativo desativado; o historico foi preservado.";
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function reprocessGame(button) {
    setStatus("Reprocessando a partida selecionada...");
    try {
      const result = await postJson("/api/admin/reprocess-game", { division: button.dataset.division, gameId: button.dataset.gameId });
      state.status = result.processed ? "Replay reprocessado e estatisticas reconstruidas." : "O replay nao pode ser reprocessado; confira o status da partida.";
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function reprocessGames() {
    setStatus("Reprocessando os arquivos salvos...");
    try {
      const result = await postJson("/api/admin/reprocess", {});
      state.status = `${result.processed} replays processados; ${result.failed} falharam.`;
      await load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function postJson(url, payload) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `Servidor retornou ${response.status}.`);
    return result;
  }

  function teamsForDivision(division) {
    const raw = state.bootstrap.content.divisions[division].teams || {};
    return ["A", "B", "C", "D"].flatMap((group) => [1, 2, 3, 4].map((seed) => `${group}${seed}`)).map((slot) => ({
      slot,
      name: raw[slot] && raw[slot].name || slot,
      tag: raw[slot] && raw[slot].tag || slot,
      logo: raw[slot] && raw[slot].logo || "",
      configured: Boolean(raw[slot] && String(raw[slot].name || "").trim())
    }));
  }

  function playerDirectory(division) {
    const result = new Map();
    const teams = state.bootstrap.content.divisions[division].teams || {};
    Object.entries(teams).forEach(([slot, team]) => {
      (team.players || []).forEach((player) => {
        if (!player.playerId) return;
        result.set(player.playerId, { name: player.player || player.name || player.riotId || "JOGADOR", slot });
      });
    });
    return result;
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
  }

  function formatDuration(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function teamLabel(slot) {
    const team = teamsForDivision(state.currentDivision).find((item) => item.slot === slot);
    return team ? team.name : slot || "-";
  }

  function formatSeriesTitle(series, teams) {
    return series.stage === "grupos" ? `${String(series.title).split(" - ")[0]} - ${formatVersus(series.teamARef, series.teamBRef, teams)}` : series.title;
  }

  function formatVersus(teamARef, teamBRef, teams) {
    return `${teamTagFromRef(teamARef, teams)} x ${teamTagFromRef(teamBRef, teams)}`;
  }

  function teamNameFromRef(ref, teams) {
    const team = teams.find((item) => item.slot === ref);
    return team && team.configured ? team.name : String(ref || "A definir");
  }

  function teamTagFromRef(ref, teams) {
    const team = teams.find((item) => item.slot === ref);
    return team && team.configured ? (team.tag || team.name) : String(ref || "A definir");
  }

  function normalizeAssetPath(value) {
    return String(value || "").replace(/\\/g, "/");
  }

  function matchLabel(division, match) {
    const series = (state.bootstrap.series[division] || []).find((item) => item.id === match.seriesId);
    const teams = teamsForDivision(division);
    const label = series ? formatSeriesTitle(series, teams) : match.seriesId;
    return `${label} - Jogo ${match.gameNumber}`;
  }

  function mappingStatusLabel(method) {
    return {
      "primary-riot-id": "Identificado pelo Riot ID principal",
      "riot-id-alias": "Identificado por alias",
      manual: "Associacao manual",
      unresolved: "Nao identificado"
    }[method] || "Nao identificado";
  }

  function summaryMetric(label, value) {
    return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
  }

  function emptyDashboard(text) {
    return `<div class="empty-dashboard">${escapeHtml(text)}</div>`;
  }

  function updateFileLabel(input) {
    const zone = input.closest("[data-dropzone]");
    const label = zone && zone.querySelector("[data-file-name]");
    if (label) label.textContent = input.files && input.files[0] ? `${input.files[0].name} (${formatBytes(input.files[0].size)})` : "Limite: 40 MB";
  }

  function setStatus(text) {
    state.status = text;
    const node = app.querySelector(".editor-status");
    if (node) node.textContent = text;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
  }

  function signed(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
