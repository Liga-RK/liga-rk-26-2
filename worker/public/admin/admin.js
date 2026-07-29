(() => {
  "use strict";

  const API = "/api/fantasy/admin";
  const PANEL_TITLES = {
    overview: "Visão geral",
    market: "Mercado global",
    sync: "Sincronização",
    rounds: "Rodadas e partidas",
    stats: "Estatísticas e pontos",
    valuation: "Valorização",
    players: "Jogadores",
    teams: "Equipes",
    users: "Usuários",
    lineups: "Escalações",
    operations: "Auditoria e backups"
  };
  const state = {
    csrf: "",
    username: "",
    activePanel: "overview",
    syncPreview: null,
    statsPreview: null,
    simulations: [],
    scores: [],
    lineups: [],
    edit: null
  };

  const el = Object.fromEntries(
    [...document.querySelectorAll("[id]")].map((node) => [toCamel(node.id), node])
  );

  bindEvents();
  restoreSession();

  function bindEvents() {
    el.loginForm.addEventListener("submit", login);
    el.logoutButton.addEventListener("click", logout);
    el.refreshButton.addEventListener("click", () => loadPanel(state.activePanel));
    document.querySelectorAll(".nav").forEach((button) =>
      button.addEventListener("click", () => selectPanel(button.dataset.panel))
    );
    el.marketOpenForm.addEventListener("submit", openMarket);
    el.marketCloseForm.addEventListener("submit", closeMarket);
    el.syncPreviewButton.addEventListener("click", previewSync);
    el.syncApplyButton.addEventListener("click", applySync);
    el.statsPreviewButton.addEventListener("click", previewStats);
    el.statsImportButton.addEventListener("click", importStats);
    el.roundForm.addEventListener("submit", saveRound);
    el.formulaForm.addEventListener("submit", saveFormula);
    el.valuationForm.addEventListener("submit", simulateValuation);
    el.backupForm.addEventListener("submit", createBackup);
    [
      el.matchDivision, el.matchRound,
      el.scoreDivision, el.scoreRound,
      el.playerDivision, el.playerSearch,
      el.teamDivision, el.userSearch,
      el.lineupDivision, el.lineupRound
    ].filter(Boolean).forEach((input) =>
      input.addEventListener("change", () => loadPanel(state.activePanel))
    );
    [el.playerSearch, el.userSearch].filter(Boolean).forEach((input) =>
      input.addEventListener("input", debounce(() => loadPanel(state.activePanel), 350))
    );
    document.addEventListener("click", handleActionClick);
    el.editDialog.addEventListener("close", async () => {
      if (el.editDialog.returnValue !== "default" || !state.edit) return;
      await saveDialogEdit();
    });
  }

  async function restoreSession() {
    try {
      const data = await api("/auth/session");
      state.csrf = data.csrfToken;
      state.username = data.username;
      showAdmin();
      await loadPanel("overview");
    } catch {
      showLogin();
    }
  }

  async function login(event) {
    event.preventDefault();
    setMessage(el.loginMessage, "Validando…");
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: {
          username: el.loginUsername.value,
          password: el.loginPassword.value
        },
        skipCsrf: true
      });
      state.csrf = data.csrfToken;
      state.username = data.username;
      el.loginPassword.value = "";
      showAdmin();
      await loadPanel("overview");
    } catch (error) {
      setMessage(el.loginMessage, error.message, true);
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
    } catch {
      // A sessão local deve ser encerrada mesmo se já expirou no servidor.
    }
    state.csrf = "";
    state.username = "";
    showLogin();
  }

  function showAdmin() {
    el.loginView.hidden = true;
    el.adminView.hidden = false;
    el.sessionUser.textContent = state.username;
  }

  function showLogin() {
    el.adminView.hidden = true;
    el.loginView.hidden = false;
    setMessage(el.loginMessage, "");
  }

  async function selectPanel(panel) {
    state.activePanel = panel;
    document.querySelectorAll(".nav").forEach((button) =>
      button.classList.toggle("active", button.dataset.panel === panel)
    );
    document.querySelectorAll(".panel").forEach((section) =>
      section.classList.toggle("active", section.id === `panel-${panel}`)
    );
    el.panelTitle.textContent = PANEL_TITLES[panel] || panel;
    await loadPanel(panel);
  }

  async function loadPanel(panel) {
    setMessage(el.globalMessage, "Atualizando dados…");
    try {
      if (panel === "overview") await loadOverview();
      if (panel === "market") await loadMarket();
      if (panel === "sync") await loadSyncRuns();
      if (panel === "rounds") await Promise.all([loadRounds(), loadMatches()]);
      if (panel === "stats") await loadScores();
      if (panel === "valuation") await Promise.all([loadFormula(), loadValuationHistory()]);
      if (panel === "players") await loadPlayers();
      if (panel === "teams") await loadTeams();
      if (panel === "users") await loadUsers();
      if (panel === "lineups") await loadLineups();
      if (panel === "operations") await Promise.all([loadBackups(), loadAudit(), loadErrors()]);
      setMessage(el.globalMessage, "");
    } catch (error) {
      setMessage(el.globalMessage, error.message, true);
    }
  }

  async function loadOverview() {
    const data = await api("/overview");
    updateMarketBadge(data.market);
    const labels = {
      users: "Usuários",
      fantasyTeams: "Times Fantasy",
      lineups: "Escalações",
      marketAssets: "Ativos no mercado",
      officialPlayers: "Jogadores oficiais",
      officialTeams: "Equipes oficiais",
      matches: "Partidas",
      rounds: "Rodadas",
      imports: "Importações",
      errors: "Erros registrados",
      backups: "Backups"
    };
    el.overviewCards.innerHTML = Object.entries(data.counts || {}).map(([key, value]) =>
      `<article class="metric"><span>${escapeHtml(labels[key] || key)}</span><strong>${number(value)}</strong></article>`
    ).join("");
    el.overviewState.innerHTML = [
      detail("Mercado", marketLabel(data.market)),
      detail("Rodada global", data.market?.roundNumber || "—"),
      detail("Fechamento", dateTime(data.market?.closesAt)),
      detail("Partida de bloqueio", data.market?.lockMatchId || "—"),
      detail("Fuso", data.timezone || "America/Sao_Paulo"),
      detail("Alertas de agenda", (data.schedule?.warnings || []).join(" ") || "Nenhum")
    ].join("");
  }

  async function loadMarket() {
    const [status, history] = await Promise.all([
      api("/market/status"),
      api("/market/history?limit=100")
    ]);
    updateMarketBadge(status.market);
    el.marketState.textContent = [
      `Estado: ${marketLabel(status.market)}`,
      `Rodada: ${status.market?.roundNumber || "—"}`,
      `Aberto em: ${dateTime(status.market?.openedAt)}`,
      `Fechamento calculado: ${dateTime(status.market?.closesAt)}`,
      `Motivo: ${status.market?.closeReason || "—"}`
    ].join("\n");
    const warnings = status.schedule?.warnings || [];
    el.marketSchedule.innerHTML = [
      ...warnings.map((warning) => `<div class="schedule-row warning"><strong>Alerta</strong><small>${escapeHtml(warning)}</small></div>`),
      ...(status.schedule?.matches || []).map((match) =>
        `<div class="schedule-row"><strong>${escapeHtml(match.division)} · ${escapeHtml(match.home_team_name || match.id)} × ${escapeHtml(match.away_team_name || "")}</strong><small>${dateTime(match.starts_at)} · ${escapeHtml(match.status)}</small></div>`
      )
    ].join("") || `<div class="schedule-row warning">Não há agenda válida para a rodada selecionada.</div>`;
    el.marketHistory.innerHTML = table(
      ["Data", "Ação", "Ator", "Resultado"],
      (history.history || []).map((row) => [
        dateTime(row.createdAt), row.action, row.actor || "system", row.result
      ])
    );
  }

  async function openMarket(event) {
    event.preventDefault();
    if (!confirm("Abrir o mesmo mercado para Elite e Ascensão?")) return;
    await action(async () => {
      const body = formObject(el.marketOpenForm);
      body.roundNumber = Number(body.roundNumber);
      const data = await api("/market/open", { method: "POST", body });
      setMessage(el.globalMessage, `Mercado aberto até ${dateTime(data.market.closesAt)}.`, false, true);
      await loadMarket();
    });
  }

  async function closeMarket(event) {
    event.preventDefault();
    if (!confirm("Fechar imediatamente o mercado das duas divisões?")) return;
    await action(async () => {
      const data = await api("/market/close", {
        method: "POST",
        body: formObject(el.marketCloseForm)
      });
      setMessage(el.globalMessage, `Mercado ${marketLabel(data.market)}.`, false, true);
      await loadMarket();
    });
  }

  async function previewSync() {
    await action(async () => {
      state.syncPreview = await api("/sync/preview", { method: "POST", body: {} });
      el.syncApplyButton.disabled = false;
      el.syncPreview.textContent = JSON.stringify({
        previewId: state.syncPreview.previewId,
        sourceHash: state.syncPreview.sourceHash,
        summary: state.syncPreview.summary,
        warnings: state.syncPreview.warnings,
        changes: state.syncPreview.changes.filter((item) => item.change !== "unchanged")
      }, null, 2);
      await loadSyncRuns();
    });
  }

  async function applySync() {
    if (!state.syncPreview || !confirm("Aplicar exatamente a prévia exibida? Os preços serão preservados.")) return;
    await action(async () => {
      const data = await api("/sync/apply", {
        method: "POST",
        body: { previewId: state.syncPreview.previewId }
      });
      state.syncPreview = null;
      el.syncApplyButton.disabled = true;
      el.syncPreview.textContent = JSON.stringify(data, null, 2);
      await loadSyncRuns();
    });
  }

  async function loadSyncRuns() {
    const data = await api("/sync/runs?limit=100");
    el.syncRuns.innerHTML = table(
      ["Data", "Modo", "Estado", "Hash", "Responsável"],
      (data.runs || []).map((row) => [
        dateTime(row.createdAt), row.mode, row.status,
        `<code>${escapeHtml(shortId(row.sourceHash))}</code>`, row.createdBy
      ])
    );
  }

  async function previewStats() {
    await action(async () => {
      state.statsPreview = await api("/stats/round-1/preview", { method: "POST", body: {} });
      el.statsImportButton.disabled = false;
      el.statsPreview.textContent = JSON.stringify({
        sourceHash: state.statsPreview.sourceHash,
        summary: state.statsPreview.summary,
        warnings: state.statsPreview.warnings
      }, null, 2);
    });
  }

  async function importStats() {
    if (!state.statsPreview || !confirm("Importar a rodada 1 sem alterar nenhum preço?")) return;
    await action(async () => {
      const data = await api("/stats/round-1/import", {
        method: "POST",
        body: { sourceHash: state.statsPreview.sourceHash }
      });
      el.statsPreview.textContent = JSON.stringify(data, null, 2);
      el.statsImportButton.disabled = true;
      state.statsPreview = null;
      await loadScores();
    });
  }

  async function loadScores() {
    const query = queryString({
      division: el.scoreDivision.value,
      round: el.scoreRound.value,
      limit: 500
    });
    const data = await api(`/scores?${query}`);
    state.scores = data.scores || [];
    el.scoresTable.innerHTML = table(
      ["Divisão", "Rodada", "Ativo", "Posição", "Jogos", "Pontos", ""],
      state.scores.map((row) => [
        row.division, row.roundNumber, `<code>${escapeHtml(shortId(row.assetId))}</code>`,
        row.role, row.games, `<strong>${decimal(row.points)}</strong>`,
        actionButton("Corrigir", "edit-score", `${row.roundId}|${row.assetId}`)
      ])
    );
  }

  async function loadRounds() {
    const data = await api("/rounds");
    el.roundsTable.innerHTML = table(
      ["Divisão", "Rodada", "Nome", "Status", "Fechamento", "Processada"],
      (data.rounds || []).map((row) => [
        row.division, row.roundNumber, row.name, row.status,
        dateTime(row.locksAt), dateTime(row.processedAt)
      ])
    );
  }

  async function saveRound(event) {
    event.preventDefault();
    await action(async () => {
      const body = formObject(el.roundForm);
      body.roundNumber = Number(body.roundNumber);
      body.opensAt = saoPauloInputToIso(body.opensAt);
      body.locksAt = saoPauloInputToIso(body.locksAt);
      await api("/rounds", { method: "POST", body });
      el.roundForm.reset();
      await loadRounds();
    });
  }

  async function loadMatches() {
    const query = queryString({
      division: el.matchDivision.value,
      round: el.matchRound.value,
      limit: 500
    });
    const data = await api(`/matches/all?${query}`);
    el.matchesTable.innerHTML = table(
      ["Divisão", "Rodada", "Confronto", "Início", "Status", "Alerta", ""],
      (data.matches || []).map((row) => [
        row.division, row.roundNumber,
        `${escapeHtml(row.homeTeamName)} × ${escapeHtml(row.awayTeamName)}`,
        dateTime(row.startsAt), row.status,
        row.scheduleIssue ? `<span class="warning">${escapeHtml(row.scheduleIssue)}</span>` : "—",
        `${actionButton("Editar", "edit-match", row.id)}
         ${actionButton("Fonte oficial", "restore-match", row.id)}`
      ])
    );
  }

  async function loadFormula() {
    const data = await api("/formula");
    const formula = data.formula;
    const labels = {
      roundWeight: "Peso da rodada",
      averageWeight: "Peso da média histórica",
      recentWeight: "Peso das recentes",
      expectationBase: "Base da expectativa",
      expectationPerPrice: "Expectativa por RK$",
      volatility: "Volatilidade",
      damping: "Amortecimento natural",
      minimumPrice: "Preço mínimo",
      minimumGames: "Jogos para confiança",
      decimals: "Casas decimais"
    };
    el.formulaForm.innerHTML = `
      <label class="wide">Versão<input name="version" value="${escapeAttr(formula.version)}" required maxlength="80"></label>
      ${Object.entries(labels).map(([key, label]) =>
        `<label>${escapeHtml(label)}<input name="${key}" type="number" step="0.01" value="${escapeAttr(formula.settings[key])}" required></label>`
      ).join("")}
      <input type="hidden" name="didNotPlay" value="hold">
      <button class="primary wide" type="submit">Salvar fórmula</button>
      <button class="ghost wide" type="button" data-action="reset-formula" data-id="global">Restaurar parâmetros padrão</button>
    `;
  }

  async function saveFormula(event) {
    event.preventDefault();
    if (!confirm("Salvar esta configuração da fórmula?")) return;
    await action(async () => {
      const raw = formObject(el.formulaForm);
      const version = raw.version;
      delete raw.version;
      for (const key of Object.keys(raw)) {
        if (key !== "didNotPlay") raw[key] = Number(raw[key]);
      }
      await api("/formula", { method: "PUT", body: { version, settings: raw } });
      await loadFormula();
    });
  }

  async function simulateValuation(event) {
    event.preventDefault();
    await action(async () => {
      const body = formObject(el.valuationForm);
      body.roundNumber = Number(body.roundNumber);
      state.simulations = (await api("/valuation/simulate", { method: "POST", body })).simulations || [];
      renderSimulations();
    });
  }

  function renderSimulations() {
    const items = state.simulations.flatMap((simulation) =>
      (simulation.items || []).map((item) => ({ ...item, simulationId: simulation.id, division: simulation.round.division }))
    );
    el.valuationActions.innerHTML = state.simulations.map((simulation) =>
      `${actionButton(`Aplicar ${simulation.round.division}`, "apply-valuation", simulation.id, "danger")}
       ${actionButton(`Cancelar ${simulation.round.division}`, "cancel-valuation", simulation.id)}`
    ).join("");
    el.valuationTable.innerHTML = table(
      ["Divisão", "Ativo", "Posição", "Preço", "Novo", "Δ", "Pontos", "Necessário", "Confiança"],
      items.map((item) => [
        item.division, item.name, item.role,
        `RK$ ${decimal(item.currentPrice)}`, `RK$ ${decimal(item.newPrice)}`,
        `<span class="${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}">${signed(item.delta)}</span>`,
        decimal(item.roundPoints), decimal(item.necessaryScore), decimal(item.confidence)
      ])
    );
  }

  async function applyValuation(id) {
    if (!confirm(`Aplicar definitivamente a simulação ${id}? Um backup será criado antes.`)) return;
    await action(async () => {
      await api("/valuation/apply", {
        method: "POST",
        body: { simulationId: id, confirmSimulationId: id }
      });
      state.simulations = state.simulations.filter((simulation) => simulation.id !== id);
      renderSimulations();
      await loadValuationHistory();
    });
  }

  async function cancelValuation(id) {
    if (!confirm("Cancelar esta simulação sem alterar preços?")) return;
    await action(async () => {
      await api("/valuation/cancel", { method: "POST", body: { simulationId: id } });
      state.simulations = state.simulations.filter((simulation) => simulation.id !== id);
      renderSimulations();
      await loadValuationHistory();
    });
  }

  async function loadValuationHistory() {
    const data = await api("/valuation/history?limit=100");
    el.valuationHistory.innerHTML = table(
      ["Data", "Divisão", "Rodada", "Versão", "Status", "Responsável"],
      (data.simulations || []).map((row) => [
        dateTime(row.createdAt), row.division, row.roundNumber,
        row.formulaVersion, row.status, row.createdBy
      ])
    );
  }

  async function loadPlayers() {
    const query = queryString({
      division: el.playerDivision.value,
      q: el.playerSearch.value,
      limit: 500
    });
    const data = await api(`/players?${query}`);
    el.playersTable.innerHTML = table(
      ["Divisão", "Equipe", "Posição", "Jogador", "Preço", "Média", "Elenco", "ID", ""],
      (data.players || []).map((row) => [
        row.division, row.teamSlot, row.role, row.name,
        row.price == null ? "—" : `RK$ ${decimal(row.price)}`,
        decimal(row.averagePoints), row.rosterStatus,
        `<code>${escapeHtml(shortId(row.id))}</code>`,
        actionButton("Editar", "edit-player", row.id)
      ])
    );
  }

  async function loadTeams() {
    const query = queryString({ division: el.teamDivision.value, limit: 200 });
    const data = await api(`/teams?${query}`);
    el.teamsTable.innerHTML = table(
      ["Divisão", "Slot", "Equipe", "Tag", "Preço", "Média", "Ativa", ""],
      (data.teams || []).map((row) => [
        row.division, row.slot, row.name, row.tag,
        row.price == null ? "—" : `RK$ ${decimal(row.price)}`,
        decimal(row.averagePoints), yesNo(row.active),
        actionButton("Editar", "edit-team", row.id)
      ])
    );
  }

  async function loadUsers() {
    const query = queryString({ q: el.userSearch.value, limit: 500 });
    const data = await api(`/users?${query}`);
    el.usersTable.innerHTML = table(
      ["Usuário", "Discord", "Times", "Escalações", "Status", "Criado", ""],
      (data.users || []).map((row) => [
        row.username, `<code>${escapeHtml(row.discordId)}</code>`, row.fantasyTeams,
        row.lineups, row.blocked ? `<span class="negative">Bloqueado</span>` : `<span class="positive">Ativo</span>`,
        dateTime(row.createdAt),
        actionButton(row.blocked ? "Desbloquear" : "Bloquear", "toggle-user", row.id, row.blocked ? "" : "danger")
      ])
    );
  }

  async function loadLineups() {
    const query = queryString({
      division: el.lineupDivision.value,
      round: el.lineupRound.value,
      limit: 500
    });
    const data = await api(`/lineups?${query}`);
    state.lineups = data.lineups || [];
    el.lineupsTable.innerHTML = table(
      ["Divisão", "Rodada", "Usuário", "Time", "Custo", "Capitão", "Ativos", "Validação", "Atualizada", ""],
      state.lineups.map((row) => [
        row.division, row.roundNumber, row.username, row.fantasyTeamName,
        `RK$ ${decimal(row.totalCost)}`, `<code>${escapeHtml(shortId(row.captainAssetId))}</code>`,
        (row.picks || []).map((pick) => `${pick.role}: ${shortId(pick.assetId)}`).join(", "),
        row.validationIssues?.length
          ? `<span class="negative">${escapeHtml(row.validationIssues.join("; "))}</span>`
          : `<span class="positive">Válida</span>`,
        dateTime(row.updatedAt),
        actionButton("Corrigir", "edit-lineup", row.id)
      ])
    );
  }

  async function loadBackups() {
    const data = await api("/backups?limit=100");
    el.backupsTable.innerHTML = table(
      ["Data", "Motivo", "Versão", "Tamanho", "Hash", ""],
      (data.backups || []).map((row) => [
        dateTime(row.createdAt), row.reason, row.schemaVersion, bytes(row.bytes),
        `<code>${escapeHtml(shortId(row.dataHash))}</code>`,
        `<a class="mini-button" href="${API}/backups/${encodeURIComponent(row.id)}">Baixar</a>
         ${actionButton("Restaurar", "restore-backup", row.id, "danger")}`
      ])
    );
  }

  async function createBackup(event) {
    event.preventDefault();
    await action(async () => {
      await api("/backups/create", { method: "POST", body: formObject(el.backupForm) });
      await loadBackups();
    });
  }

  async function loadAudit() {
    const data = await api("/audit?limit=200");
    el.auditTable.innerHTML = table(
      ["Data", "Ação", "Ator", "Alvo", "Resultado"],
      (data.audit || []).map((row) => [
        dateTime(row.createdAt), row.action,
        row.actorAdminUsername || row.actorUserId || "system",
        `${row.targetType}:${shortId(row.targetId)}`, row.result
      ])
    );
  }

  async function loadErrors() {
    const data = await api("/errors?limit=200");
    el.errorsTable.innerHTML = table(
      ["Data", "Rota", "Erro", "Request ID"],
      (data.errors || []).map((row) => [
        dateTime(row.createdAt), `${row.method} ${row.route}`,
        `<span class="negative">${escapeHtml(row.errorMessage)}</span>`,
        `<code>${escapeHtml(shortId(row.requestId))}</code>`
      ])
    );
  }

  async function handleActionClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action: name, id } = button.dataset;
    if (name === "apply-valuation") return applyValuation(id);
    if (name === "cancel-valuation") return cancelValuation(id);
    if (name === "edit-match") return openMatchEdit(id);
    if (name === "restore-match") return restoreOfficialMatch(id);
    if (name === "edit-score") return openScoreEdit(id);
    if (name === "edit-player") return openPlayerEdit(id);
    if (name === "edit-team") return openTeamEdit(id);
    if (name === "edit-lineup") return openLineupEdit(id);
    if (name === "toggle-user") return toggleUser(id);
    if (name === "reset-formula") return resetFormula();
    if (name === "restore-backup") return restoreBackup(id);
  }

  async function openMatchEdit(id) {
    const data = await api("/matches/all?limit=500");
    const row = data.matches.find((match) => match.id === id);
    if (!row) return;
    openEdit("match", id, "Editar partida", [
      field("startsAt", "Início (America/Sao_Paulo)", "datetime-local", saoPauloInput(row.startsAt)),
      field("status", "Status", "select", row.status, ["scheduled", "live", "completed", "postponed", "cancelled"]),
      field("homeScore", "Placar mandante", "number", row.homeScore ?? ""),
      field("awayScore", "Placar visitante", "number", row.awayScore ?? ""),
      field("scheduleIssue", "Alerta de agenda", "text", row.scheduleIssue || "")
    ]);
  }

  async function restoreOfficialMatch(id) {
    if (!confirm("Descartar a correção manual e restaurar os dados desta partida vindos da fonte oficial?")) return;
    await action(async () => {
      await api(`/matches/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: { restoreOfficial: true }
      });
      await loadMatches();
    });
  }

  async function openScoreEdit(key) {
    const separator = key.indexOf("|");
    const roundId = key.slice(0, separator);
    const assetId = key.slice(separator + 1);
    const row = state.scores.find((score) =>
      score.roundId === roundId && score.assetId === assetId
    );
    if (!row) return;
    openEdit("score", key, `Corrigir pontuação · ${shortId(assetId)}`, [
      field("games", "Partidas disputadas", "number", row.games),
      field("points", "Pontos da rodada", "number", row.points),
      field("reason", "Motivo", "text", "Correção administrativa")
    ]);
  }

  async function openPlayerEdit(id) {
    const data = await api(`/players?q=${encodeURIComponent(id)}&limit=20`);
    const row = data.players.find((player) => player.id === id);
    if (!row) return;
    openEdit("player", id, `Editar ${row.name}`, [
      field("name", "Nome", "text", row.name),
      field("division", "Divisão", "select", row.division, ["elite", "ascension"]),
      field("teamId", "ID estável da equipe", "text", row.teamId || ""),
      field("role", "Posição", "select", row.role, ["TOP", "JG", "MID", "ADC", "SUP"]),
      field("price", "Preço atual (RK$)", "number", row.price ?? ""),
      field("riotId", "Riot ID", "text", row.riotId || ""),
      field("opgg", "OP.GG", "url", row.opgg || ""),
      field("rosterStatus", "Status do elenco", "select", row.rosterStatus, ["starter", "reserve", "active", "inactive"]),
      field("active", "Ativo", "select", String(Number(row.active)), ["1", "0"]),
      field("manualOverride", "Preservar edição manual", "select", "1", ["1", "0"])
    ]);
  }

  async function openLineupEdit(id) {
    const row = state.lineups.find((lineup) => lineup.id === id);
    if (!row) return;
    const byRole = new Map((row.picks || []).map((pick) => [pick.role, pick.assetId]));
    openEdit("lineup", id, `Corrigir escalação · ${row.username}`, [
      ...["TOP", "JG", "MID", "ADC", "SUP", "TEAM"].map((role) =>
        field(`pick_${role}`, `${role} · ID do ativo`, "text", byRole.get(role) || "")
      ),
      field("captainAssetId", "ID do capitão", "text", row.captainAssetId || ""),
      field("reserveAssetId", "ID do reserva (opcional)", "text", row.reserve?.assetId || ""),
      field("reason", "Motivo", "text", "Correção administrativa")
    ]);
  }

  async function openTeamEdit(id) {
    const data = await api("/teams?limit=200");
    const row = data.teams.find((team) => team.id === id);
    if (!row) return;
    openEdit("team", id, `Editar ${row.name}`, [
      field("name", "Nome", "text", row.name),
      field("division", "Divisão", "select", row.division, ["elite", "ascension"]),
      field("tag", "Tag", "text", row.tag),
      field("price", "Preço atual (RK$)", "number", row.price ?? ""),
      field("logo", "Logo", "text", row.logo || ""),
      field("active", "Ativa", "select", String(Number(row.active)), ["1", "0"]),
      field("manualOverride", "Preservar edição manual", "select", "1", ["1", "0"])
    ]);
  }

  async function toggleUser(id) {
    const data = await api(`/users?q=${encodeURIComponent(id)}&limit=20`);
    const row = data.users.find((user) => user.id === id);
    if (!row) return;
    const blocked = !Number(row.blocked);
    const reason = blocked ? prompt("Motivo do bloqueio:", "Bloqueio administrativo") : "";
    if (blocked && reason === null) return;
    await action(async () => {
      await api(`/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: { blocked, reason }
      });
      await loadUsers();
    });
  }

  async function resetFormula() {
    if (!confirm("Restaurar os parâmetros seguros padrão da fórmula?")) return;
    await action(async () => {
      await api("/formula/reset", { method: "POST", body: {} });
      await loadFormula();
    });
  }

  async function restoreBackup(id) {
    if (!confirm("A restauração substitui dados e só é permitida com o mercado fechado. Deseja gerar a prévia?")) return;
    await action(async () => {
      const preview = await api("/backups/restore/preview", {
        method: "POST",
        body: { backupId: id }
      });
      const confirmation = prompt(
        `${preview.warning}\n\nDigite o ID completo para confirmar:\n${id}`,
        ""
      );
      if (confirmation !== id) throw new Error("Restauração cancelada: confirmação não confere.");
      await api("/backups/restore/apply", {
        method: "POST",
        body: { backupId: id, confirmBackupId: confirmation }
      });
      await Promise.all([loadBackups(), loadAudit(), loadErrors()]);
    });
  }

  function openEdit(type, id, title, fields) {
    state.edit = { type, id };
    el.dialogTitle.textContent = title;
    el.dialogFields.innerHTML = fields.join("");
    el.editDialog.returnValue = "";
    el.editDialog.showModal();
  }

  async function saveDialogEdit() {
    const edit = state.edit;
    state.edit = null;
    const inputs = el.dialogFields.querySelectorAll("input,select,textarea");
    const body = Object.fromEntries([...inputs].map((input) => [input.name, input.value]));
    if (edit.type === "match") {
      body.startsAt = saoPauloInputToIso(body.startsAt);
      body.homeScore = nullableNumber(body.homeScore);
      body.awayScore = nullableNumber(body.awayScore);
    }
    if (edit.type === "player" || edit.type === "team") {
      body.active = body.active === "1";
      body.manualOverride = body.manualOverride === "1";
      if (body.price !== "") body.price = Number(body.price);
      else delete body.price;
    }
    if (edit.type === "score") {
      const separator = edit.id.indexOf("|");
      body.roundId = edit.id.slice(0, separator);
      body.assetId = edit.id.slice(separator + 1);
      body.games = Number(body.games);
      body.points = Number(body.points);
    }
    if (edit.type === "lineup") {
      body.picks = ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"].map((role) => ({
        role,
        assetId: body[`pick_${role}`]
      }));
      for (const role of ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"]) {
        delete body[`pick_${role}`];
      }
    }
    await action(async () => {
      if (edit.type === "score") {
        await api("/scores/correct", { method: "POST", body });
      } else {
        const endpoint = edit.type === "match" ? "matches" : `${edit.type}s`;
        await api(`/${endpoint}/${encodeURIComponent(edit.id)}`, { method: "PUT", body });
      }
      await loadPanel(state.activePanel);
    });
  }

  function updateMarketBadge(market) {
    const open = market?.status === "open";
    el.globalMarketBadge.textContent = open ? "Mercado aberto" : "Mercado fechado";
    el.globalMarketBadge.classList.toggle("open", open);
    el.globalMarketBadge.classList.toggle("closed", !open);
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = new Headers({ Accept: "application/json" });
    if (method !== "GET") {
      headers.set("Content-Type", "application/json");
      if (!options.skipCsrf && state.csrf) headers.set("X-CSRF-Token", state.csrf);
    }
    const response = await fetch(`${API}${path}`, {
      method,
      credentials: "same-origin",
      headers,
      body: method === "GET" ? undefined : JSON.stringify(options.body || {}),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      if (response.status === 401 && path !== "/auth/login") showLogin();
      const error = new Error(payload.error?.message || `Erro HTTP ${response.status}`);
      error.details = payload.error?.details;
      throw error;
    }
    return payload.data || {};
  }

  async function action(callback) {
    setMessage(el.globalMessage, "Processando…");
    try {
      await callback();
      if (!el.globalMessage.textContent || el.globalMessage.textContent === "Processando…") {
        setMessage(el.globalMessage, "Operação concluída.", false, true);
      }
    } catch (error) {
      const details = error.details ? ` ${JSON.stringify(error.details)}` : "";
      setMessage(el.globalMessage, `${error.message}${details}`, true);
    }
  }

  function table(headers, rows) {
    if (!rows.length) return `<p class="state-box">Nenhum registro encontrado.</p>`;
    return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${
      rows.map((row) => `<tr>${row.map((cell) => `<td>${cell == null ? "—" : cell}</td>`).join("")}</tr>`).join("")
    }</tbody></table>`;
  }

  function detail(label, value) {
    return `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? "—"))}</strong></div>`;
  }

  function actionButton(label, actionName, id, className = "") {
    return `<button class="mini-button ${escapeAttr(className)}" type="button" data-action="${escapeAttr(actionName)}" data-id="${escapeAttr(id)}">${escapeHtml(label)}</button>`;
  }

  function field(name, label, type, value, options = []) {
    if (type === "select") {
      return `<label>${escapeHtml(label)}<select name="${escapeAttr(name)}">${
        options.map((option) => `<option value="${escapeAttr(option)}"${String(option) === String(value) ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")
      }</select></label>`;
    }
    const step = type === "number" ? ` step="0.01"` : "";
    return `<label>${escapeHtml(label)}<input name="${escapeAttr(name)}" type="${escapeAttr(type)}"${step} value="${escapeAttr(value)}"></label>`;
  }

  function formObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function queryString(values) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== "" && value !== null && value !== undefined) query.set(key, value);
    }
    return query.toString();
  }

  function setMessage(node, text, error = false, success = false) {
    node.textContent = text || "";
    node.classList.toggle("error", error);
    node.classList.toggle("success", success);
  }

  function marketLabel(market) {
    return market?.status === "open" ? "ABERTO" : "FECHADO";
  }

  function dateTime(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed)
      ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short"
      }).format(parsed)
      : "—";
  }

  function saoPauloInput(value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return "";
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).formatToParts(parsed).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function saoPauloInputToIso(value) {
    if (!value) return "";
    const parsed = Date.parse(`${value}:00-03:00`);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
  }

  function number(value) {
    return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
  }

  function decimal(value) {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function signed(value) {
    const numberValue = Number(value) || 0;
    return `${numberValue > 0 ? "+" : ""}${decimal(numberValue)}`;
  }

  function bytes(value) {
    const amount = Number(value) || 0;
    if (amount < 1024) return `${amount} B`;
    if (amount < 1024 * 1024) return `${decimal(amount / 1024)} KB`;
    return `${decimal(amount / 1024 / 1024)} MB`;
  }

  function shortId(value) {
    const text = String(value || "");
    return text.length > 18 ? `${text.slice(0, 9)}…${text.slice(-6)}` : text || "—";
  }

  function yesNo(value) {
    return Number(value) ? "Sim" : "Não";
  }

  function nullableNumber(value) {
    return value === "" ? null : Number(value);
  }

  function toCamel(value) {
    return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function debounce(callback, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => callback(...args), delay);
    };
  }
})();
