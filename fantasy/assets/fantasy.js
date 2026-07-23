(() => {
  "use strict";

  const config = {
    apiBase: "",
    backendMode: "local",
    budget: 100,
    maxPlayersPerRealTeam: 2,
    season: "Liga RK 26.2",
    ...(window.FANTASY_RK_CONFIG || {})
  };
  const AUTH_STORAGE_KEY = "rk-fantasy-session-v1";
  let authToken = readAuthToken();
  let initialAuthMessage = "";
  let initialAuthError = false;

  const ROLE_LABELS = {
    TOP: "TOP",
    JG: "JUNGLE",
    MID: "MID",
    ADC: "ADC",
    SUP: "SUPORTE",
    TEAM: "EQUIPE"
  };
  const ROLE_ORDER = ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"];
  const ROLE_ASSETS = {
    TOP: "assets/lanes/top.png",
    JG: "assets/lanes/jungle.png",
    MID: "assets/lanes/mid.png",
    ADC: "assets/lanes/adc.png",
    SUP: "assets/lanes/suporte.png",
    TEAM: "assets/lanes/equipe.png"
  };
  const PLAYER_ROLES = ROLE_ORDER.filter((role) => role !== "TEAM");
  const TEAM_LOGO_ONLY_PLAYERS = new Set([
    "elite:FVL:TOP",
    "elite:PXB:JG",
    "elite:SDK:TOP",
    "ascension:BST:JG",
    "ascension:BST:MID",
    "ascension:PXG:TOP",
    "ascension:PXG:SUP",
    "ascension:RDG:SUP",
    "ascension:UBR:SUP"
  ]);

  const state = {
    division: "elite",
    view: "market",
    market: { elite: [], ascension: [] },
    popular: { elite: [], ascension: [] },
    marketOpen: { elite: true, ascension: true },
    roundInfo: { elite: null, ascension: null },
    lineups: { elite: emptyLineup(), ascension: emptyLineup() },
    teamName: "Meu Time RK",
    userName: "",
    loaded: false
  };

  let preparedShare = null;
  let popularRefreshTimer = null;

  const el = {
    navButtons: document.querySelectorAll("[data-view]"),
    views: document.querySelectorAll(".app-view"),
    divisionTabs: document.querySelectorAll("[data-division]"),
    lineupSlots: document.getElementById("lineup-slots"),
    marketGrid: document.getElementById("market-grid"),
    marketLoading: document.getElementById("market-loading"),
    budgetTotal: document.getElementById("budget-total"),
    budgetSpent: document.getElementById("budget-spent"),
    budgetRemaining: document.getElementById("budget-remaining"),
    selectedCount: document.getElementById("selected-count"),
    search: document.getElementById("search-player"),
    roleFilter: document.getElementById("role-filter"),
    sortFilter: document.getElementById("sort-filter"),
    clearLineup: document.getElementById("clear-lineup"),
    shareLineup: document.getElementById("share-lineup"),
    shareDialog: document.getElementById("share-dialog"),
    closeShareDialog: document.getElementById("close-share-dialog"),
    sharePreview: document.getElementById("share-preview"),
    downloadShareImage: document.getElementById("download-share-image"),
    whatsappShareImage: document.getElementById("whatsapp-share-image"),
    systemShareImage: document.getElementById("system-share-image"),
    shareMessage: document.getElementById("share-message"),
    teamLimitDialog: document.getElementById("team-limit-dialog"),
    closeTeamLimitDialog: document.getElementById("close-team-limit-dialog"),
    confirmTeamLimitDialog: document.getElementById("confirm-team-limit-dialog"),
    teamLimitMessage: document.getElementById("team-limit-message"),
    teamLimitPlayers: document.getElementById("team-limit-players"),
    saveLineup: document.getElementById("save-lineup"),
    captainReminder: document.getElementById("captain-reminder"),
    lineupMessage: document.getElementById("lineup-message"),
    renameTeam: document.getElementById("rename-team"),
    fantasyTeamName: document.getElementById("fantasy-team-name"),
    accountButton: document.getElementById("account-button"),
    accountLabel: document.getElementById("account-label"),
    accountDialog: document.getElementById("account-dialog"),
    demoUserName: document.getElementById("demo-user-name"),
    confirmDemoUser: document.getElementById("confirm-demo-user"),
    rankingBody: document.getElementById("ranking-body"),
    marketStatus: document.getElementById("market-status"),
    marketDeadline: document.getElementById("market-deadline"),
    marketDashboard: document.getElementById("market-dashboard"),
    marketClosed: document.getElementById("market-closed"),
    closedMarketMessage: document.getElementById("closed-market-message"),
    closedMarketDetail: document.getElementById("closed-market-detail"),
    closedLineups: document.getElementById("closed-lineups"),
    marketPanel: document.getElementById("market-panel"),
    popularList: document.getElementById("popular-list"),
    popularDivision: document.getElementById("popular-division"),
    closedActions: document.querySelectorAll("[data-closed-action]"),
    roleShortcuts: document.querySelectorAll("[data-role-shortcut]")
  };

  init();

  async function init() {
    await completeCloudLogin();
    restoreLocalState();
    bindEvents();
    if (config.backendMode === "cloud") await loadCloudAccount();
    renderAccount();
    renderLineup();
    renderMarketShell();
    renderRanking();
    await loadMarket();
    if (config.backendMode === "cloud") {
      await Promise.all([loadCloudLineup("elite"), loadCloudLineup("ascension")]);
      await Promise.all([loadCloudConfig(state.division), loadCloudRanking(), loadCloudPopular(state.division)]);
      renderLineup();
      renderMarketShell();
      renderMarket();
      startPopularRefresh();
    }
    if (initialAuthMessage) setMessage(initialAuthMessage, initialAuthError, !initialAuthError);
  }

  function bindEvents() {
    el.navButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    el.divisionTabs.forEach((button) => button.addEventListener("click", () => setDivision(button.dataset.division)));
    [el.search, el.sortFilter].forEach((input) => input.addEventListener("input", renderMarket));
    el.roleFilter.addEventListener("input", () => setRoleFilter(el.roleFilter.value, { scroll: false }));
    el.roleShortcuts.forEach((button) => button.addEventListener("click", () => setRoleFilter(button.dataset.roleShortcut)));
    el.closedActions.forEach((button) => button.addEventListener("click", () => handleClosedAction(button.dataset.closedAction)));
    el.clearLineup.addEventListener("click", clearLineup);
    el.shareLineup.addEventListener("click", shareLineupImage);
    el.closeShareDialog.addEventListener("click", closeShareDialog);
    el.downloadShareImage.addEventListener("click", downloadPreparedShare);
    el.whatsappShareImage.addEventListener("click", sharePreparedOnWhatsApp);
    el.systemShareImage.addEventListener("click", sharePreparedWithSystem);
    el.shareDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeShareDialog();
    });
    el.closeTeamLimitDialog.addEventListener("click", closeTeamLimitDialog);
    el.confirmTeamLimitDialog.addEventListener("click", closeTeamLimitDialog);
    el.teamLimitDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeTeamLimitDialog();
    });
    el.saveLineup.addEventListener("click", saveLineup);
    el.renameTeam.addEventListener("click", renameTeam);
    el.accountButton.addEventListener("click", openAccount);
    el.confirmDemoUser.addEventListener("click", confirmDemoUser);
  }

  async function loadMarket() {
    setLoading("Carregando equipes e jogadores oficiais...");
    try {
      if (config.backendMode === "cloud") {
        const [elite, ascension] = await Promise.all([fetchCloudMarket("elite"), fetchCloudMarket("ascension")]);
        state.market.elite = elite;
        state.market.ascension = ascension;
      } else {
        const response = await fetch(`${String(config.apiBase).replace(/\/+$/, "")}/api/content?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const payload = await response.json();
        const content = payload.content && payload.content.divisions ? payload.content : payload;
        if (!content || !content.divisions) throw new Error("Conteúdo oficial inválido");
        state.market.elite = buildMarket(content.divisions.elite, "elite");
        state.market.ascension = buildMarket(content.divisions.ascension, "ascension");
      }
    } catch (error) {
      console.warn("RK Fantasy: usando dados de demonstração.", error);
      const content = demoContent();
      state.market.elite = buildMarket(content.divisions.elite, "elite");
      state.market.ascension = buildMarket(content.divisions.ascension, "ascension");
      setMessage("A API oficial não respondeu; exibindo dados de demonstração.", false);
    }

    state.loaded = true;
    el.marketLoading.hidden = true;
    el.marketGrid.hidden = false;
    renderPopularPicks();
    renderMarket();
    renderLineup();
  }

  async function fetchCloudMarket(division) {
    const response = await apiFetch(`/api/fantasy/market?division=${encodeURIComponent(division)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(payload, `Mercado ${division} indisponível.`));
    return (payload.market || []).map((item) => ({
      id: String(item.id),
      type: item.type === "team" ? "team" : "player",
      role: normalizeRole(item.role),
      name: cleanText(item.name),
      teamName: cleanText(item.teamName),
      teamTag: cleanText(item.teamTag).toUpperCase(),
      teamSlot: cleanText(item.teamSlot),
      logo: normalizeAssetPath(item.logo),
      price: roundMoney(item.price),
      average: roundMoney(item.average)
    }));
  }

  function buildMarket(division, divisionKey) {
    const entries = [];
    Object.entries((division && division.teams) || {}).forEach(([slot, team]) => {
      const name = cleanText(team && team.name);
      const tag = cleanText(team && (team.tag || slot)).toUpperCase();
      if (!name || /vaga dispon|nome do time/i.test(name)) return;
      const logo = normalizeAssetPath(team.logo || "");
      const teamSeed = stableNumber(`${divisionKey}:${slot}:${tag}`);
      entries.push({
        id: `team:${divisionKey}:${slot}`,
        type: "team",
        role: "TEAM",
        name,
        teamName: name,
        teamTag: tag,
        teamSlot: slot,
        logo,
        price: roundMoney(9 + (teamSeed % 700) / 100),
        average: roundMoney(8 + (teamSeed % 900) / 100)
      });

      (team.players || []).forEach((player, index) => {
        const playerName = cleanText(player && (player.player || player.name || player.riotId));
        const role = normalizeRole(player && player.lane);
        if (!playerName || !ROLE_ORDER.includes(role) || role === "TEAM" || isPlaceholder(playerName)) return;
        const id = String(player.playerId || `${divisionKey}:${slot}:${index}`);
        const seed = stableNumber(`${id}:${playerName}:${role}`);
        const roleBase = { TOP: 11, JG: 12, MID: 13, ADC: 13, SUP: 10 }[role] || 10;
        entries.push({
          id,
          type: "player",
          role,
          name: playerName,
          teamName: name,
          teamTag: tag,
          teamSlot: slot,
          riotId: cleanText(player.riotId),
          logo,
          price: roundMoney(roleBase + (seed % 800) / 100),
          average: roundMoney(7 + (seed % 1300) / 100)
        });
      });
    });
    return entries;
  }

  function renderMarket() {
    if (!state.loaded) return;
    if (el.marketLoading) el.marketLoading.hidden = true;
    if (el.marketGrid) el.marketGrid.hidden = false;
    const query = cleanText(el.search.value).toLocaleLowerCase("pt-BR");
    let role = el.roleFilter.value;
    const sort = el.sortFilter.value;
    const lineup = currentLineup();
    const selectedIds = new Set(Object.values(lineup.slots).filter(Boolean).map((item) => item.id));
    const reserveId = lineup.reserve ? lineup.reserve.id : "";

    let items = state.market[state.division]
      .filter((item) => role === "ALL" || item.role === role)
      .filter((item) => !query || `${item.name} ${item.teamName} ${item.teamTag}`.toLocaleLowerCase("pt-BR").includes(query))
      .sort(sortMarket(sort));

    if (!items.length && role !== "ALL" && state.market[state.division].length) {
      role = "ALL";
      el.roleFilter.value = "ALL";
      el.roleShortcuts.forEach((button) => button.classList.toggle("active", button.dataset.roleShortcut === "ALL"));
      items = state.market[state.division]
        .filter((item) => !query || `${item.name} ${item.teamName} ${item.teamTag}`.toLocaleLowerCase("pt-BR").includes(query))
        .sort(sortMarket(sort));
    }

    const players = items.filter((item) => item.role !== "TEAM");
    const teams = items.filter((item) => item.role === "TEAM");
    const sections = [];
    if (players.length) {
      const title = role === "ALL" ? "Jogadores" : ROLE_LABELS[role];
      sections.push(marketSection(title, role === "ALL" ? "TOP" : role, players, selectedIds, lineup, false));
    }
    if (teams.length) sections.push(marketSection("Equipes", "TEAM", teams, selectedIds, lineup, true));
    el.marketGrid.replaceChildren(...sections);
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Nenhum jogador encontrado com esses filtros.";
      el.marketGrid.appendChild(empty);
    }
  }

  function renderPopularPicks() {
    if (!el.popularList) return;
    if (el.popularDivision) el.popularDivision.textContent = state.division === "elite" ? "Divisão Elite" : "Divisão Ascensão";
    const byRole = new Map((state.popular[state.division] || []).map((item) => [item.role, item]));
    el.popularList.replaceChildren(...PLAYER_ROLES.map((role) => {
      const item = byRole.get(role);
      const row = document.createElement("article");
      row.className = `popular-row${item ? "" : " empty"}`;

      const logo = document.createElement("div");
      logo.className = "popular-logo";
      if (item) {
        logo.appendChild(createLogo(item));
      } else {
        const icon = document.createElement("img");
        icon.src = ROLE_ASSETS[role];
        icon.alt = "";
        logo.appendChild(icon);
      }

      const info = document.createElement("div");
      info.className = "popular-info";
      const name = document.createElement("strong");
      name.textContent = item ? item.name : "Aguardando escolhas";
      const meta = document.createElement("span");
      meta.textContent = item ? `${ROLE_LABELS[role]} · ${item.teamTag}` : ROLE_LABELS[role];
      info.append(name, meta);

      row.append(logo, info);
      return row;
    }));
  }

  function renderMarketShell() {
    const open = isMarketOpen();
    if (el.marketDashboard) el.marketDashboard.hidden = !open;
    if (el.marketClosed) el.marketClosed.hidden = open;
    if (!open) {
      const round = state.roundInfo[state.division];
      if (el.closedMarketMessage) {
        el.closedMarketMessage.textContent = "As escalações desta rodada foram bloqueadas. Estamos atualizando jogos, pontuações e preços.";
      }
      if (el.closedMarketDetail) el.closedMarketDetail.textContent = closedMarketDetail(round);
    }
    renderClosedLineups();
  }

  function renderClosedLineups() {
    if (!el.closedLineups) return;
    const divisions = ["elite", "ascension"];
    el.closedLineups.replaceChildren(...divisions.map((division) => {
      const lineup = state.lineups[division] || emptyLineup();
      const picks = ROLE_ORDER.map((role) => ({ role, item: lineup.slots[role] })).filter((entry) => entry.item);
      const card = document.createElement("article");
      card.className = "closed-lineup-card";
      const title = document.createElement("div");
      title.className = "closed-lineup-title";
      const name = document.createElement("strong");
      name.textContent = division === "elite" ? "Divisão Elite" : "Divisão Ascensão";
      const status = document.createElement("span");
      status.textContent = picks.length ? `${picks.length}/6 escolhas salvas` : (state.userName ? "Nenhuma escalação salva" : "Entre para ver sua escalação");
      title.append(name, status);
      card.appendChild(title);

      if (!picks.length) {
        const empty = document.createElement("p");
        empty.className = "closed-lineup-empty";
        empty.textContent = state.userName ? "Você ainda não tem escalação salva para esta divisão." : "Faça login pelo Discord para consultar suas últimas escolhas.";
        card.appendChild(empty);
        return card;
      }

      const list = document.createElement("ul");
      list.className = "closed-lineup-list";
      for (const { role, item } of picks) {
        const row = document.createElement("li");
        const roleLabel = document.createElement("span");
        roleLabel.textContent = ROLE_LABELS[role];
        const player = document.createElement("strong");
        player.textContent = `${item.name}${item.id === lineup.captainId ? " ★" : ""}`;
        const team = document.createElement("small");
        team.textContent = `${item.teamTag} · RK$ ${formatNumber(item.price)}`;
        row.append(roleLabel, player, team);
        list.appendChild(row);
      }
      if (lineup.reserve) {
        const reserve = document.createElement("li");
        reserve.className = "reserve-summary";
        const roleLabel = document.createElement("span");
        roleLabel.textContent = "RES";
        const player = document.createElement("strong");
        player.textContent = lineup.reserve.name;
        const team = document.createElement("small");
        team.textContent = `${ROLE_LABELS[lineup.reserve.role]} · ${lineup.reserve.teamTag}`;
        reserve.append(roleLabel, player, team);
        list.appendChild(reserve);
      }
      card.appendChild(list);
      return card;
    }));
  }

  function marketSection(title, role, items, selectedIds, lineup, teamSection) {
    const section = document.createElement("section");
    section.className = `market-section${teamSection ? " team-market-section" : ""}`;
    const heading = document.createElement("h3");
    heading.className = "market-section-title";
    const icon = document.createElement("img");
    icon.src = ROLE_ASSETS[role];
    icon.alt = "";
    const label = document.createTextNode(title);
    const count = document.createElement("span");
    count.textContent = `${items.length} ${items.length === 1 ? "opção" : "opções"}`;
    heading.append(icon, label, count);
    const cards = document.createElement("div");
    cards.className = "market-cards";
    cards.replaceChildren(...items.map((item) => marketCard(
      item,
      selectedIds.has(item.id),
      el.roleFilter.value === "ALL" && Boolean(lineup.slots[item.role]) && !selectedIds.has(item.id),
      reserveId === item.id
    )));
    section.append(heading, cards);
    return section;
  }

  function marketCard(item, selected, roleComplete, reserveSelected) {
    const card = document.createElement("article");
    card.className = `player-card${selected ? " selected" : ""}${roleComplete ? " role-complete" : ""}${reserveSelected ? " reserve-selected" : ""}`;

    const logo = createLogo(item);
    const meta = document.createElement("div");
    meta.className = "player-meta";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const team = document.createElement("span");
    team.textContent = `${ROLE_LABELS[item.role]} · ${item.teamTag}`;
    const stats = document.createElement("div");
    stats.className = "player-stats";
    stats.innerHTML = `<span>Média ${formatNumber(item.average)}</span>`;
    meta.append(name, team, stats);

    const price = document.createElement("div");
    price.className = "player-price";
    price.innerHTML = `<strong><b>RK$</b> ${formatNumber(item.price)}</strong><span>mercado</span>`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "buy-button";
    button.textContent = selected ? "Remover" : "Escalar";
    button.addEventListener("click", () => selected ? removeItem(item.role) : addItem(item));

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.appendChild(button);
    if (item.type === "player") {
      const reserveButton = document.createElement("button");
      reserveButton.type = "button";
      reserveButton.className = "reserve-button";
      reserveButton.textContent = reserveSelected ? "Remover reserva" : "Reserva";
      reserveButton.disabled = selected && !reserveSelected;
      reserveButton.title = selected && !reserveSelected ? "Remova dos titulares antes de usar como reserva." : "Escolher como reserva";
      reserveButton.addEventListener("click", () => reserveSelected ? removeReserve() : setReserve(item));
      actions.appendChild(reserveButton);
    }

    card.append(logo, meta, price, actions);
    return card;
  }

  function renderLineup() {
    const lineup = currentLineup();
    el.lineupSlots.replaceChildren(...ROLE_ORDER.map((role) => lineupSlot(role, lineup.slots[role])), reserveSlot(lineup.reserve));
    const spent = lineupCost(lineup);
    const selected = Object.values(lineup.slots).filter(Boolean).length;
    el.budgetTotal.textContent = formatNumber(config.budget);
    el.budgetSpent.textContent = formatNumber(spent);
    el.budgetRemaining.textContent = formatNumber(config.budget - spent);
    el.selectedCount.textContent = `${selected}/6${lineup.reserve ? " + reserva" : ""}`;
    el.fantasyTeamName.textContent = state.teamName;
    const reserveError = lineup.reserve && selected === 6 ? reserveValidationMessage(lineup.reserve, lineup) : "";
    const closed = !isMarketOpen();
    el.saveLineup.disabled = closed || selected !== 6 || !lineup.captainId || spent > config.budget || Boolean(reserveError);
    el.saveLineup.textContent = closed ? "Mercado fechado" : (lineup.saved ? "Atualizar escalação" : "Salvar escalação");
    el.shareLineup.disabled = selected === 0;
    el.captainReminder.hidden = selected !== 6 || Boolean(lineup.captainId);
    el.roleShortcuts.forEach((button) => {
      const role = button.dataset.roleShortcut;
      button.classList.toggle("active", role === el.roleFilter.value);
      button.classList.toggle("complete", role !== "ALL" && Boolean(lineup.slots[role]));
    });
  }

  function lineupSlot(role, item) {
    const slot = document.createElement("div");
    slot.className = `lineup-slot${item ? " filled" : ""}${el.roleFilter.value === role ? " active-filter" : ""}`;
    const selector = document.createElement("button");
    selector.type = "button";
    selector.className = "slot-selector";
    selector.setAttribute("aria-label", `Filtrar mercado por ${ROLE_LABELS[role]}`);
    selector.addEventListener("click", () => setRoleFilter(role));
    const badge = document.createElement("div");
    badge.className = "role-badge";
    const roleIcon = document.createElement("img");
    roleIcon.src = ROLE_ASSETS[role];
    roleIcon.alt = "";
    badge.appendChild(roleIcon);

    const info = document.createElement("div");
    info.className = "slot-info";
    const strong = document.createElement("strong");
    strong.textContent = item ? item.name : `Escolha ${ROLE_LABELS[role]}`;
    const detail = document.createElement("span");
    detail.textContent = item ? `${item.teamTag} · RK$ ${formatNumber(item.price)}` : "Vaga disponível";
    info.append(strong, detail);
    selector.append(badge, info);

    const actions = document.createElement("div");
    actions.className = "slot-actions";
    if (item && role !== "TEAM") {
      const captain = document.createElement("button");
      captain.type = "button";
      captain.className = `captain-button${currentLineup().captainId === item.id ? " active" : ""}`;
      captain.title = "Definir como capitão";
      captain.textContent = "CAPITÃO";
      captain.addEventListener("click", () => setCaptain(item.id));
      actions.appendChild(captain);
    }
    if (item) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.title = "Remover";
      remove.textContent = "×";
      remove.addEventListener("click", () => removeItem(role));
      actions.appendChild(remove);
    }

    slot.append(selector, actions);
    return slot;
  }

  function reserveSlot(item) {
    const lineup = currentLineup();
    const selected = Object.values(lineup.slots).filter(Boolean).length;
    const budget = reserveBudget(lineup);
    const slot = document.createElement("div");
    slot.className = `lineup-slot reserve-slot${item ? " filled" : ""}`;
    const selector = document.createElement("button");
    selector.type = "button";
    selector.className = "slot-selector";
    selector.setAttribute("aria-label", "Filtrar mercado para escolher reserva");
    selector.addEventListener("click", () => setRoleFilter("ALL"));

    const badge = document.createElement("div");
    badge.className = "role-badge reserve-badge";
    badge.textContent = "R";

    const info = document.createElement("div");
    info.className = "slot-info";
    const strong = document.createElement("strong");
    strong.textContent = item ? item.name : "Escolha reserva";
    const detail = document.createElement("span");
    detail.textContent = item
      ? `${ROLE_LABELS[item.role]} · ${item.teamTag} · RK$ ${formatNumber(item.price)}`
      : selected === 6
        ? `Pode custar até RK$ ${formatNumber(budget)}`
        : "Complete os titulares para liberar";
    info.append(strong, detail);
    selector.append(badge, info);

    const actions = document.createElement("div");
    actions.className = "slot-actions";
    if (item) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.title = "Remover reserva";
      remove.textContent = "×";
      remove.addEventListener("click", removeReserve);
      actions.appendChild(remove);
    }

    slot.append(selector, actions);
    return slot;
  }

  function addItem(item) {
    const lineup = currentLineup();
    const replacing = lineup.slots[item.role];
    const nextCost = lineupCost(lineup) - (replacing ? replacing.price : 0) + item.price;
    if (nextCost > config.budget) {
      setMessage("Seu orçamento não é suficiente para essa escolha.", true);
      return;
    }
    if (item.type === "player") {
      const sameTeamPlayers = Object.values(lineup.slots).filter((picked) => picked && picked.type === "player" && picked.teamSlot === item.teamSlot && picked.role !== item.role);
      if (sameTeamPlayers.length >= config.maxPlayersPerRealTeam) {
        setMessage(`É permitido escalar no máximo ${config.maxPlayersPerRealTeam} jogadores da mesma equipe.`, true);
        openTeamLimitDialog(item, sameTeamPlayers);
        return;
      }
    }
    lineup.slots[item.role] = item;
    if (lineup.reserve && lineup.reserve.id === item.id) lineup.reserve = null;
    if (replacing && lineup.captainId === replacing.id) lineup.captainId = "";
    const removedReserve = clearInvalidReserveIfComplete(lineup);
    lineup.saved = false;
    persistLocalState();
    setMessage(removedReserve ? `${item.name} foi adicionado. ${removedReserve} saiu da reserva por não caber mais na regra.` : `${item.name} foi adicionado à escalação.`, false, true);
    const nextRole = ROLE_ORDER.find((role) => !lineup.slots[role]);
    setRoleFilter(nextRole || "ALL", { scroll: false });
  }

  function removeItem(role) {
    const lineup = currentLineup();
    const removed = lineup.slots[role];
    if (!removed) return;
    lineup.slots[role] = null;
    if (lineup.captainId === removed.id) lineup.captainId = "";
    lineup.saved = false;
    persistLocalState();
    setMessage(`${removed.name} foi removido.`, false);
    renderLineup();
    renderMarket();
  }

  function setReserve(item) {
    const lineup = currentLineup();
    const selected = Object.values(lineup.slots).filter(Boolean).length;
    if (selected !== 6) {
      setMessage("Complete os seis titulares antes de escolher o reserva.", true);
      return;
    }
    const error = reserveValidationMessage(item, lineup);
    if (error) {
      setMessage(error, true);
      return;
    }
    lineup.reserve = item;
    lineup.saved = false;
    persistLocalState();
    setMessage(`${item.name} foi escolhido como reserva. Ele só entra se um titular jogador não atuar na rodada.`, false, true);
    renderLineup();
    renderMarket();
  }

  function removeReserve() {
    const lineup = currentLineup();
    if (!lineup.reserve) return;
    const name = lineup.reserve.name;
    lineup.reserve = null;
    lineup.saved = false;
    persistLocalState();
    setMessage(`${name} saiu da reserva.`, false);
    renderLineup();
    renderMarket();
  }

  function clearInvalidReserveIfComplete(lineup) {
    if (!lineup.reserve || Object.values(lineup.slots).filter(Boolean).length !== 6) return "";
    const error = reserveValidationMessage(lineup.reserve, lineup);
    if (!error) return "";
    const name = lineup.reserve.name;
    lineup.reserve = null;
    return name;
  }

  function setCaptain(id) {
    currentLineup().captainId = id;
    currentLineup().saved = false;
    persistLocalState();
    setMessage("Capitão definido. Ele pontuará 1,5×.", false, true);
    renderLineup();
  }

  function clearLineup() {
    state.lineups[state.division] = emptyLineup();
    persistLocalState();
    setRoleFilter("ALL", { scroll: false });
    setMessage("Escalação limpa.", false);
    renderLineup();
    renderMarket();
  }

  function openTeamLimitDialog(item, sameTeamPlayers) {
    const teamName = cleanText(item.teamName) || cleanText(item.teamTag) || "essa equipe";
    el.teamLimitMessage.textContent = `Você não pode escalar ${item.name}, pois o limite de ${config.maxPlayersPerRealTeam} jogadores da equipe ${teamName} já foi atingido.`;
    el.teamLimitPlayers.replaceChildren(...sameTeamPlayers.map((player) => {
      const entry = document.createElement("li");
      entry.textContent = `${ROLE_LABELS[player.role]} · ${player.name}`;
      return entry;
    }));
    if (!el.teamLimitDialog.open) el.teamLimitDialog.showModal();
  }

  function closeTeamLimitDialog() {
    if (el.teamLimitDialog.open) el.teamLimitDialog.close();
  }

  async function saveLineup() {
    const lineup = currentLineup();
    const items = Object.values(lineup.slots).filter(Boolean);
    if (!isMarketOpen()) {
      setMessage("O mercado está fechado. Você poderá alterar sua escalação quando a próxima janela abrir.", true);
      renderMarketShell();
      return;
    }
    if (items.length !== 6 || !lineup.captainId) {
      setMessage("Complete as seis vagas e escolha um capitão.", true);
      return;
    }
    if (!state.userName && config.backendMode === "local") {
      openAccount();
      setMessage("Identifique-se antes de salvar.", true);
      return;
    }
    const reserveError = lineup.reserve ? reserveValidationMessage(lineup.reserve, lineup) : "";
    if (reserveError) {
      setMessage(reserveError, true);
      return;
    }

    const payload = {
      division: state.division,
      teamName: state.teamName,
      captainPlayerId: lineup.captainId,
      picks: items.map((item) => ({ id: item.id, role: item.role, price: item.price, teamSlot: item.teamSlot })),
      reserve: lineup.reserve ? { id: lineup.reserve.id, role: lineup.reserve.role, price: lineup.reserve.price, teamSlot: lineup.reserve.teamSlot } : null
    };

    el.saveLineup.disabled = true;
    setMessage("Salvando escalação...", false);
    try {
      if (config.backendMode === "cloud") {
        const response = await apiFetch("/api/fantasy/lineups/current", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(apiErrorMessage(result, "Não foi possível salvar a escalação."));
      }
      lineup.saved = true;
      if (config.backendMode === "cloud") loadCloudPopular(state.division);
      persistLocalState();
      setMessage("Escalação salva! Você ainda pode alterá-la até o mercado fechar.", false, true);
    } catch (error) {
      setMessage(error.message || "Erro ao salvar a escalação.", true);
    } finally {
      renderLineup();
    }
  }

  function setRoleFilter(role, options = {}) {
    const normalized = role === "ALL" ? "ALL" : normalizeRole(role);
    if (normalized !== "ALL" && !ROLE_ORDER.includes(normalized)) return;
    el.roleFilter.value = normalized;
    el.roleShortcuts.forEach((button) => button.classList.toggle("active", button.dataset.roleShortcut === normalized));
    renderLineup();
    renderMarket();
    if (options.scroll !== false) el.marketPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setDivision(division) {
    if (!state.lineups[division]) return;
    state.division = division;
    el.roleFilter.value = "ALL";
    el.search.value = "";
    el.roleShortcuts.forEach((button) => button.classList.toggle("active", button.dataset.roleShortcut === "ALL"));
    el.divisionTabs.forEach((button) => button.classList.toggle("active", button.dataset.division === division));
    setMessage("", false);
    renderLineup();
    renderMarket();
    renderPopularPicks();
    renderMarketShell();
    if (config.backendMode === "cloud") {
      loadCloudConfig(division);
      loadCloudPopular(division);
      if (state.view === "ranking") loadCloudRanking();
    }
  }

  function setView(view) {
    state.view = view;
    el.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    el.views.forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
    if (view === "market") {
      renderMarketShell();
      if (config.backendMode === "cloud") loadCloudPopular(state.division);
    }
    if (view === "ranking" && config.backendMode === "cloud") loadCloudRanking();
  }

  function handleClosedAction(action) {
    if (action === "ranking") {
      setView("ranking");
      return;
    }
    if (action === "rules") {
      setView("rules");
      return;
    }
    if (action === "lineups" && el.closedLineups) {
      el.closedLineups.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function renameTeam() {
    const next = window.prompt("Nome do seu time no RK Fantasy:", state.teamName);
    if (next === null) return;
    const clean = cleanText(next).slice(0, 32);
    if (!clean) return;
    state.teamName = clean;
    currentLineup().saved = false;
    persistLocalState();
    renderLineup();
  }

  function openAccount() {
    if (config.backendMode === "cloud") {
      clearAuthToken();
      window.location.href = `${apiBase()}/api/fantasy/auth/login`;
      return;
    }
    el.demoUserName.value = state.userName;
    el.accountDialog.showModal();
  }

  function confirmDemoUser() {
    const name = cleanText(el.demoUserName.value).slice(0, 32);
    if (!name) return;
    state.userName = name;
    persistLocalState();
    renderAccount();
    el.accountDialog.close();
    setMessage(`Olá, ${name}! Sua escalação já pode ser salva.`, false, true);
  }

  function renderAccount() {
    el.accountLabel.textContent = state.userName || (config.backendMode === "cloud" ? "Não conectado" : "Modo demonstração");
    el.accountButton.textContent = state.userName ? "Trocar" : "Entrar";
  }

  function renderRanking() {
    const rows = [
      [1, "Barões da Madrugada", "Rickito", "87,40", "241,65"],
      [2, "Só Mais Uma MD3", "Theo", "81,15", "228,20"],
      [3, "Gap de Visão", "Melare", "76,90", "219,75"],
      [4, "Meu Time RK", state.userName || "Você", "0,00", "0,00"]
    ];
    el.rankingBody.innerHTML = rows.map(([position, team, user, round, total]) =>
      `<tr><td>${position}</td><td>${escapeHtml(team)}</td><td>${escapeHtml(user)}</td><td>${round}</td><td>${total}</td></tr>`
    ).join("");
  }

  async function loadCloudAccount() {
    try {
      const response = await apiFetch("/api/fantasy/me", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      state.userName = response.ok && payload.authenticated && payload.user ? cleanText(payload.user.username) : "";
      if (!state.userName && authToken) clearAuthToken();
    } catch (error) {
      console.warn("Não foi possível consultar a sessão do RK Fantasy.", error);
    }
  }

  async function loadCloudLineup(division) {
    if (!state.userName) return;
    try {
      const response = await apiFetch(`/api/fantasy/lineups/current?division=${encodeURIComponent(division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.lineup) return;
      if (payload.team && payload.team.name) state.teamName = cleanText(payload.team.name);
      const lineup = emptyLineup();
      for (const pick of payload.lineup.picks || []) {
        const role = normalizeRole(pick.role);
        const marketItem = state.market[division].find((item) => item.id === String(pick.id));
        if (marketItem && ROLE_ORDER.includes(role)) lineup.slots[role] = marketItem;
      }
      if (payload.lineup.reserve && payload.lineup.reserve.id) {
        const reserveItem = state.market[division].find((item) => item.id === String(payload.lineup.reserve.id));
        if (reserveItem && reserveItem.type === "player") lineup.reserve = reserveItem;
      }
      lineup.captainId = cleanText(payload.lineup.captain_asset_id || payload.lineup.captainId);
      lineup.saved = true;
      state.lineups[division] = lineup;
    } catch (error) {
      console.warn(`Não foi possível carregar a escalação ${division}.`, error);
    }
  }

  async function loadCloudConfig(division) {
    try {
      const response = await apiFetch(`/api/fantasy/config?division=${encodeURIComponent(division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      const round = payload.round;
      if (!response.ok || !round) return;
      const now = Date.now();
      const open = round.status === "open" && now >= Date.parse(round.opens_at) && now < Date.parse(round.locks_at);
      state.roundInfo[division] = round;
      state.marketOpen[division] = open;
      if (division === state.division) {
        el.marketStatus.textContent = open ? "ABERTO" : "FECHADO";
        el.marketStatus.style.color = open ? "var(--success)" : "var(--danger)";
        const lockDate = new Date(round.locks_at);
        el.marketDeadline.textContent = open
          ? `${round.name} · fecha em ${lockDate.toLocaleString("pt-BR")}`
          : `${round.name} · mercado fechado`;
        renderLineup();
        renderMarketShell();
      }
    } catch (error) {
      console.warn("Não foi possível carregar o status da rodada.", error);
    }
  }

  async function loadCloudPopular(division) {
    if (config.backendMode !== "cloud") {
      state.popular[division] = [];
      renderPopularPicks();
      return;
    }
    try {
      const response = await apiFetch(`/api/fantasy/popular?division=${encodeURIComponent(division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Mais escalados indisponÃ­veis."));
      state.popular[division] = (payload.popular || []).map((item) => {
        const marketItem = state.market[division].find((asset) => asset.id === String(item.id));
        return marketItem || {
          id: String(item.id),
          type: "player",
          role: normalizeRole(item.role),
          name: cleanText(item.name),
          teamName: cleanText(item.teamName),
          teamTag: cleanText(item.teamTag).toUpperCase(),
          teamSlot: cleanText(item.teamSlot),
          logo: normalizeAssetPath(item.logo),
          price: roundMoney(item.price),
          average: roundMoney(item.average)
        };
      });
    } catch (error) {
      console.warn("NÃ£o foi possÃ­vel carregar os mais escalados.", error);
      state.popular[division] = [];
    }
    if (division === state.division) renderPopularPicks();
  }

  function startPopularRefresh() {
    if (popularRefreshTimer || config.backendMode !== "cloud") return;
    popularRefreshTimer = window.setInterval(() => {
      if (state.view === "market" && isMarketOpen()) loadCloudPopular(state.division);
    }, 60000);
  }

  async function loadCloudRanking() {
    try {
      const response = await apiFetch(`/api/fantasy/ranking?division=${encodeURIComponent(state.division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Ranking indisponível."));
      const rows = payload.ranking || [];
      el.rankingBody.innerHTML = rows.length ? rows.map((row) =>
        `<tr><td>${Number(row.position) || "-"}</td><td>${escapeHtml(row.teamName)}</td><td>${escapeHtml(row.manager)}</td><td>${formatNumber(row.roundPoints)}</td><td>${formatNumber(row.totalPoints)}</td></tr>`
      ).join("") : `<tr><td colspan="5">O ranking ainda não possui pontuações.</td></tr>`;
    } catch (error) {
      console.warn("Não foi possível carregar o ranking online.", error);
    }
  }

  function apiBase() {
    return String(config.apiBase || "").replace(/\/+$/, "");
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
    return fetch(`${apiBase()}${path}`, { ...options, headers, credentials: "include" });
  }

  async function completeCloudLogin() {
    if (config.backendMode !== "cloud") return;
    const params = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
    const loginCode = cleanText(params.get("loginCode"));
    const loginError = cleanText(params.get("loginError"));
    if (!loginCode && !loginError) return;

    history.replaceState(null, "", `${location.pathname}${location.search}`);
    if (loginError) {
      initialAuthMessage = loginError;
      initialAuthError = true;
      return;
    }

    try {
      const response = await fetch(`${apiBase()}/api/fantasy/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: loginCode }),
        credentials: "omit",
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      const token = cleanText(payload.token || payload.data?.token);
      if (!response.ok || !token) throw new Error(apiErrorMessage(payload, "Não foi possível concluir o login."));
      saveAuthToken(token);
      initialAuthMessage = "Login realizado com sucesso.";
    } catch (error) {
      clearAuthToken();
      initialAuthMessage = error.message || "Não foi possível concluir o login pelo Discord.";
      initialAuthError = true;
    }
  }

  function readAuthToken() {
    try { return cleanText(localStorage.getItem(AUTH_STORAGE_KEY)); } catch { return ""; }
  }

  function saveAuthToken(token) {
    authToken = cleanText(token);
    try { localStorage.setItem(AUTH_STORAGE_KEY, authToken); } catch {}
  }

  function clearAuthToken() {
    authToken = "";
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
  }

  function apiErrorMessage(payload, fallback) {
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload?.error?.message === "string" && payload.error.message.trim()) return payload.error.message;
    return fallback;
  }

  function restoreLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem("fantasy-rk-state-v1") || "null");
      if (!saved) return;
      state.teamName = cleanText(saved.teamName) || state.teamName;
      state.userName = cleanText(saved.userName);
      for (const division of ["elite", "ascension"]) {
        if (saved.lineups && saved.lineups[division]) state.lineups[division] = sanitizeLineup(saved.lineups[division]);
      }
    } catch (error) {
      console.warn("Não foi possível restaurar o estado local.", error);
    }
  }

  function persistLocalState() {
    localStorage.setItem("fantasy-rk-state-v1", JSON.stringify({
      teamName: state.teamName,
      userName: state.userName,
      lineups: state.lineups
    }));
  }

  function sanitizeLineup(value) {
    const lineup = emptyLineup();
    for (const role of ROLE_ORDER) {
      const item = value && value.slots && value.slots[role];
      if (item && item.id && item.role === role) lineup.slots[role] = item;
    }
    const reserve = value && value.reserve;
    if (reserve && reserve.id && reserve.type === "player") lineup.reserve = reserve;
    lineup.captainId = cleanText(value && value.captainId);
    lineup.saved = Boolean(value && value.saved);
    return lineup;
  }

  function emptyLineup() {
    return { slots: Object.fromEntries(ROLE_ORDER.map((role) => [role, null])), reserve: null, captainId: "", saved: false };
  }

  function currentLineup() {
    return state.lineups[state.division];
  }

  function isMarketOpen(division = state.division) {
    return state.marketOpen[division] !== false;
  }

  function closedMarketDetail(round) {
    if (!round) return "Aguarde a organização abrir a próxima rodada.";
    const opensAt = Date.parse(round.opens_at);
    if (round.status === "scheduled" && Number.isFinite(opensAt) && opensAt > Date.now()) {
      return `A próxima janela abre em ${new Date(round.opens_at).toLocaleString("pt-BR")}.`;
    }
    if (round.status === "scored") return "A pontuação desta rodada já foi processada. Aguarde a próxima janela do mercado.";
    return "Você ainda pode ver ranking, regras e suas últimas escalações enquanto a rodada é atualizada.";
  }

  function lineupCost(lineup) {
    return roundMoney(Object.values(lineup.slots).reduce((total, item) => total + (item ? Number(item.price) : 0), 0));
  }

  function starterPlayers(lineup) {
    return PLAYER_ROLES.map((role) => lineup.slots[role]).filter(Boolean);
  }

  function reserveBudget(lineup) {
    const players = starterPlayers(lineup);
    const cheapestPlayer = players.length ? Math.min(...players.map((item) => Number(item.price) || 0)) : 0;
    return roundMoney(config.budget - lineupCost(lineup) + cheapestPlayer);
  }

  function reserveValidationMessage(item, lineup) {
    if (!item || item.type !== "player" || item.role === "TEAM") return "A reserva precisa ser um jogador, não uma equipe.";
    if (Object.values(lineup.slots).some((picked) => picked && picked.id === item.id)) return "Esse jogador já está como titular. O reserva precisa ser outro jogador.";
    if (Object.values(lineup.slots).filter(Boolean).length !== 6) return "Complete os seis titulares antes de escolher o reserva.";
    const budget = reserveBudget(lineup);
    if (Number(item.price) > budget + 0.001) return `Esse reserva custa RK$ ${formatNumber(item.price)}, mas seu limite para reserva é RK$ ${formatNumber(budget)}.`;
    const sameTeamPlayers = starterPlayers(lineup).filter((picked) => picked.teamSlot === item.teamSlot);
    if (sameTeamPlayers.length >= config.maxPlayersPerRealTeam) return `Para o reserva poder entrar em qualquer ausência, escolha alguém de uma equipe com no máximo ${config.maxPlayersPerRealTeam - 1} titular no seu time.`;
    return "";
  }

  function setLoading(message) {
    el.marketLoading.hidden = false;
    el.marketGrid.hidden = true;
    el.marketLoading.textContent = message;
  }

  function setMessage(message, isError = false, isSuccess = false) {
    el.lineupMessage.textContent = message || "";
    el.lineupMessage.classList.toggle("error", Boolean(isError));
    el.lineupMessage.classList.toggle("success", Boolean(isSuccess));
  }

  function createLogo(item) {
    const artwork = itemArtworkPath(item);
    const source = artwork || item.logo;
    if (source) {
      const img = document.createElement("img");
      img.className = "player-logo";
      img.src = source;
      img.alt = artwork && item.type === "player" ? `Arte de ${item.name}` : `Logo ${item.teamName}`;
      img.addEventListener("error", () => {
        if (item.logo && img.src !== new URL(item.logo, location.href).href) {
          img.src = item.logo;
          img.alt = `Logo ${item.teamName}`;
          return;
        }
        img.replaceWith(fallbackLogo(item.teamTag));
      });
      return img;
    }
    return fallbackLogo(item.teamTag);
  }

  function itemArtworkPath(item) {
    if (!item || item.type === "team" || item.role === "TEAM") return item && item.logo ? item.logo : "";
    if (shouldUseTeamLogoOnly(item)) return "";
    const divisionFolder = state.division === "elite" ? "equipes_elite" : "equipes_ascensao";
    const roleFolders = state.division === "elite"
      ? { TOP: "top", JG: "jg", MID: "mid", ADC: "adc", SUP: "sup" }
      : { TOP: "top", JG: "jungle", MID: "mid", ADC: "adc", SUP: "sup" };
    const roleNumbers = { TOP: 1, JG: 2, MID: 3, ADC: 4, SUP: 5 };
    const teamTag = cleanText(item.teamTag).toLowerCase();
    if (!teamTag || !roleFolders[item.role]) return item.logo || "";
    return `assets/uploads/${divisionFolder}/jogadores/${roleFolders[item.role]}/${teamTag}_${roleNumbers[item.role]}.png`;
  }

  function shouldUseTeamLogoOnly(item) {
    const division = cleanText(state.division);
    const teamTag = cleanText(item && item.teamTag).toUpperCase();
    const role = cleanText(item && item.role).toUpperCase();
    return TEAM_LOGO_ONLY_PLAYERS.has(`${division}:${teamTag}:${role}`);
  }

  function fallbackLogo(tag) {
    const div = document.createElement("div");
    div.className = "player-logo fallback";
    div.textContent = String(tag || "RK").slice(0, 4);
    return div;
  }

  async function shareLineupImage() {
    const lineup = currentLineup();
    const selected = Object.values(lineup.slots).filter(Boolean).length;
    if (!selected) {
      setMessage("Escolha pelo menos um jogador antes de gerar a imagem.", true);
      return;
    }
    setMessage("Gerando sua imagem de compartilhamento...", false);
    el.shareLineup.disabled = true;
    try {
      const blob = await buildLineupShareImage(lineup);
      const safeName = cleanText(state.teamName).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meu-time-rk";
      const file = new File([blob], `${safeName}-rk-fantasy.png`, { type: "image/png" });
      clearPreparedShare();
      preparedShare = { blob, file, url: URL.createObjectURL(blob) };
      el.sharePreview.src = preparedShare.url;
      el.systemShareImage.hidden = !canSharePreparedFile();
      setShareMessage("");
      el.shareDialog.showModal();
      setMessage("Imagem pronta. Escolha como deseja compartilhar.", false, true);
    } catch (error) {
      console.warn("Não foi possível gerar a imagem da escalação.", error);
      setMessage("Não foi possível gerar a imagem agora.", true);
    } finally {
      el.shareLineup.disabled = selected === 0;
    }
  }

  function canSharePreparedFile() {
    return Boolean(preparedShare && navigator.share && navigator.canShare && navigator.canShare({ files: [preparedShare.file] }));
  }

  function setShareMessage(message, isError = false, isSuccess = false) {
    el.shareMessage.textContent = message || "";
    el.shareMessage.classList.toggle("error", Boolean(isError));
    el.shareMessage.classList.toggle("success", Boolean(isSuccess));
  }

  function downloadPreparedShare() {
    if (!preparedShare) return;
    downloadBlob(preparedShare.blob, preparedShare.file.name);
    setShareMessage("Imagem PNG salva na pasta de downloads.", false, true);
  }

  async function sharePreparedOnWhatsApp() {
    if (!preparedShare) return;
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

    if (isTouchDevice && canSharePreparedFile()) {
      try {
        await navigator.share({
          title: `${state.teamName} — RK Fantasy`,
          text: "Minha escalação no RK Fantasy da Liga RK!",
          files: [preparedShare.file]
        });
        setShareMessage("Imagem enviada para o compartilhamento do celular.", false, true);
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }

    const whatsappWindow = window.open("about:blank", "_blank");
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": preparedShare.blob })]);
        copied = true;
      }
    } catch (error) {
      console.warn("Não foi possível copiar a imagem para a área de transferência.", error);
    }

    if (!copied) downloadBlob(preparedShare.blob, preparedShare.file.name);
    if (whatsappWindow) whatsappWindow.location.href = "https://web.whatsapp.com/";
    setShareMessage(
      copied
        ? "Imagem copiada. Escolha uma conversa no WhatsApp e pressione Ctrl+V."
        : "Imagem baixada. Abra o WhatsApp e anexe o PNG salvo.",
      false,
      true
    );
  }

  async function sharePreparedWithSystem() {
    if (!canSharePreparedFile()) return;
    try {
      await navigator.share({
        title: `${state.teamName} — RK Fantasy`,
        text: "Minha escalação no RK Fantasy da Liga RK!",
        files: [preparedShare.file]
      });
      setShareMessage("Imagem compartilhada!", false, true);
    } catch (error) {
      if (!error || error.name !== "AbortError") setShareMessage("Não foi possível abrir o compartilhamento.", true);
    }
  }

  function closeShareDialog() {
    if (el.shareDialog.open) el.shareDialog.close();
    clearPreparedShare();
  }

  function clearPreparedShare() {
    if (preparedShare && preparedShare.url) URL.revokeObjectURL(preparedShare.url);
    preparedShare = null;
    el.sharePreview.removeAttribute("src");
    setShareMessage("");
  }

  async function buildLineupShareImage(lineup) {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const ctx = canvas.getContext("2d");
    const [wallpaper, fantasyLogo] = await Promise.all([
      loadCanvasImage("assets/branding/wallpaper-rk.png"),
      loadCanvasImage("assets/branding/logo-rk-fantasy.png")
    ]);

    drawCover(ctx, wallpaper, 0, 0, canvas.width, canvas.height);
    const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
    overlay.addColorStop(0, "rgba(0,0,0,.52)");
    overlay.addColorStop(.34, "rgba(7,5,7,.82)");
    overlay.addColorStop(1, "rgba(5,5,7,.98)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(229,38,50,.16)";
    ctx.fillRect(0, 0, 18, canvas.height);

    ctx.drawImage(fantasyLogo, 58, 35, 152, 152);
    ctx.fillStyle = "#ffffff";
    ctx.font = "54px Anton, Impact, sans-serif";
    ctx.fillText("LIGA RK 26.2", 238, 102);
    ctx.fillStyle = "#ff5a65";
    ctx.font = "25px Inter, Arial, sans-serif";
    ctx.fillText(state.division === "elite" ? "DIVISÃO ELITE" : "DIVISÃO ASCENSÃO", 242, 145);

    roundedRect(ctx, 58, 205, 1084, 84, 18, "rgba(8,7,9,.84)", "rgba(229,38,50,.55)");
    ctx.fillStyle = "#ff7a83";
    ctx.font = "19px Inter, Arial, sans-serif";
    ctx.fillText("MEU TIME", 88, 239);
    ctx.fillStyle = "#ffffff";
    ctx.font = "39px Anton, Impact, sans-serif";
    ctx.fillText(fitCanvasText(ctx, state.teamName, 950), 88, 275);

    const spent = lineupCost(lineup);
    const finance = [
      ["PATRIMÔNIO", config.budget],
      ["UTILIZADO", spent],
      ["DISPONÍVEL", config.budget - spent]
    ];
    finance.forEach(([label, value], index) => {
      const x = 58 + index * 368;
      roundedRect(ctx, x, 318, 348, 118, 16, index === 2 ? "rgba(121,14,24,.78)" : "rgba(15,12,15,.9)", index === 2 ? "rgba(255,78,89,.7)" : "rgba(255,255,255,.16)");
      ctx.fillStyle = "#bdb5b7";
      ctx.font = "18px Inter, Arial, sans-serif";
      ctx.fillText(label, x + 24, 353);
      ctx.fillStyle = "#ff5964";
      ctx.font = "21px Inter, Arial, sans-serif";
      ctx.fillText("RK$", x + 24, 402);
      ctx.fillStyle = "#ffffff";
      ctx.font = "43px Anton, Impact, sans-serif";
      ctx.fillText(formatNumber(value), x + 70, 407);
    });

    const entries = await Promise.all(ROLE_ORDER.map(async (role) => {
      const item = lineup.slots[role];
      const image = item ? await loadItemCanvasImage(item) : await loadCanvasImage(ROLE_ASSETS[role]).catch(() => null);
      return { role, item, image };
    }));
    const reserveEntry = lineup.reserve ? { item: lineup.reserve, image: await loadItemCanvasImage(lineup.reserve) } : null;

    entries.forEach(({ role, item, image }, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 58 + column * 552;
      const y = 480 + row * 278;
      const width = 532;
      const height = 248;
      roundedRect(ctx, x, y, width, height, 20, "rgba(11,9,12,.93)", item ? "rgba(229,38,50,.4)" : "rgba(255,255,255,.14)");
      ctx.fillStyle = "#ff5a65";
      ctx.font = "21px Anton, Impact, sans-serif";
      ctx.fillText(ROLE_LABELS[role], x + 26, y + 38);
      if (image) {
        ctx.save();
        roundedPath(ctx, x + 24, y + 57, 154, 154, 17);
        ctx.clip();
        ctx.fillStyle = "#050507";
        ctx.fillRect(x + 24, y + 57, 154, 154);
        drawContain(ctx, image, x + 24, y + 57, 154, 154, 8);
        ctx.restore();
      }
      if (item) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "32px Anton, Impact, sans-serif";
        ctx.fillText(fitCanvasText(ctx, item.name, 310), x + 198, y + 105);
        ctx.fillStyle = "#bdb5b7";
        ctx.font = "18px Inter, Arial, sans-serif";
        ctx.fillText(fitCanvasText(ctx, item.teamName, 300), x + 198, y + 137);
        ctx.fillStyle = "#ff6872";
        ctx.font = "20px Inter, Arial, sans-serif";
        ctx.fillText(`RK$ ${formatNumber(item.price)}`, x + 198, y + 181);
        if (lineup.captainId === item.id) {
          roundedRect(ctx, x + 198, y + 193, 130, 32, 16, "#e52632");
          ctx.fillStyle = "#ffffff";
          ctx.font = "15px Inter, Arial, sans-serif";
          ctx.fillText("★ CAPITÃO", x + 214, y + 215);
        }
      } else {
        ctx.fillStyle = "#8f888b";
        ctx.font = "27px Anton, Impact, sans-serif";
        ctx.fillText("VAGA DISPONÍVEL", x + 198, y + 132);
      }
    });

    if (reserveEntry) {
      const item = reserveEntry.item;
      const x = 58;
      const y = 1314;
      roundedRect(ctx, x, y, 1084, 94, 18, "rgba(57,10,16,.88)", "rgba(255,194,75,.52)");
      ctx.fillStyle = "#ffc24b";
      ctx.font = "20px Anton, Impact, sans-serif";
      ctx.fillText("RESERVA", x + 26, y + 36);
      if (reserveEntry.image) {
        ctx.save();
        roundedPath(ctx, x + 148, y + 17, 58, 58, 12);
        ctx.clip();
        ctx.fillStyle = "#050507";
        ctx.fillRect(x + 148, y + 17, 58, 58);
        drawContain(ctx, reserveEntry.image, x + 148, y + 17, 58, 58, 5);
        ctx.restore();
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "28px Anton, Impact, sans-serif";
      ctx.fillText(fitCanvasText(ctx, item.name, 410), x + 226, y + 43);
      ctx.fillStyle = "#bdb5b7";
      ctx.font = "17px Inter, Arial, sans-serif";
      ctx.fillText(`${ROLE_LABELS[item.role]} · ${item.teamTag}`, x + 226, y + 69);
      ctx.fillStyle = "#ff6872";
      ctx.font = "20px Inter, Arial, sans-serif";
      ctx.fillText(`RK$ ${formatNumber(item.price)} · só entra se titular não jogar`, x + 650, y + 55);
    }

    ctx.fillStyle = "#9c9497";
    ctx.font = "18px Inter, Arial, sans-serif";
    ctx.fillText("Monte seu time no RK Fantasy · fantasy-rk.vitorskd2.workers.dev", 60, 1452);
    ctx.fillStyle = "#e52632";
    ctx.fillRect(60, 1473, 1080, 4);

    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao exportar PNG.")), "image/png", .96));
  }

  function loadCanvasImage(src) {
    return new Promise((resolve, reject) => {
      if (!src) return reject(new Error("Imagem ausente."));
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
      image.src = src;
    });
  }

  async function loadItemCanvasImage(item) {
    const sources = [itemArtworkPath(item), item.logo].filter(Boolean);
    for (const source of sources) {
      try {
        return await loadCanvasImage(source);
      } catch (error) {
        console.warn(`Não foi possível carregar ${source}.`, error);
      }
    }
    return null;
  }

  function drawCover(ctx, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  function drawContain(ctx, image, x, y, width, height, padding = 0) {
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const scale = Math.min(innerWidth / image.width, innerHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(image, x + padding + (innerWidth - drawWidth) / 2, y + padding + (innerHeight - drawHeight) / 2, drawWidth, drawHeight);
  }

  function roundedPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function roundedRect(ctx, x, y, width, height, radius, fill, stroke = "") {
    roundedPath(ctx, x, y, width, height, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function fitCanvasText(ctx, value, maxWidth) {
    const text = cleanText(value);
    if (ctx.measureText(text).width <= maxWidth) return text;
    let fitted = text;
    while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
    return `${fitted}…`;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sortMarket(sort) {
    if (sort === "price-asc") return (a, b) => a.price - b.price || a.name.localeCompare(b.name, "pt-BR");
    if (sort === "name") return (a, b) => a.name.localeCompare(b.name, "pt-BR");
    if (sort === "avg-desc") return (a, b) => b.average - a.average || b.price - a.price;
    return (a, b) => b.price - a.price || a.name.localeCompare(b.name, "pt-BR");
  }

  function normalizeRole(value) {
    const role = cleanText(value).toUpperCase();
    const aliases = { JUNGLE: "JG", JUNGLER: "JG", SUPPORT: "SUP", SUPORTE: "SUP", BOT: "ADC", BOTTOM: "ADC" };
    return aliases[role] || role;
  }

  function isPlaceholder(value) {
    return /^(?:jogador|player|sub|reserva|-|--)$/i.test(cleanText(value));
  }

  function normalizeAssetPath(value) {
    return String(value || "").replace(/\\/g, "/");
  }

  function stableNumber(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function cleanText(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function demoContent() {
    const teams = [
      ["A1", "Favelão", "FVL"], ["A2", "SkyLine", "SKY"], ["A3", "Barões do Oeste", "BDO"], ["A4", "Nexus Rush", "NXR"],
      ["B1", "Fofoletes do Rick", "FFLT"], ["B2", "Favelinha Reformed", "FVLR"], ["B3", "Último Pick", "UPK"], ["B4", "Visão Negada", "VNG"]
    ];
    const names = {
      TOP: ["Melare", "Atlas", "Brutus", "Kronos", "Mako", "Lince", "Nox", "Gael"],
      JG: ["Theo", "Smiteiro", "Javali", "Druid", "Kaynado", "Rift", "Mango", "Zedão"],
      MID: ["Aurora", "Rickito", "Namiya", "Pixel", "Kaiser", "Vega", "Loki", "Mika"],
      ADC: ["Flecha", "Jinxado", "Kai", "Moon", "Viper", "Seth", "Dante", "Frost"],
      SUP: ["Wardado", "MilioMain", "LuluGap", "Bardola", "Sage", "Poppy", "Luxy", "Morg" ]
    };
    const makeDivision = (offset = 0) => ({ teams: Object.fromEntries(teams.map(([slot, name, tag], index) => [slot, {
      name: offset ? `${name} Academy` : name,
      tag: offset ? `${tag}A` : tag,
      logo: "",
      players: ROLE_ORDER.filter((role) => role !== "TEAM").map((role) => ({
        playerId: `${offset}:${slot}:${role}`,
        player: names[role][(index + offset) % names[role].length],
        riotId: `${names[role][(index + offset) % names[role].length]}#RK`,
        lane: role
      }))
    }])) });
    return { divisions: { elite: makeDivision(0), ascension: makeDivision(1) } };
  }
})();
