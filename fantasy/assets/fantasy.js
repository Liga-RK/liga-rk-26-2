(() => {
  "use strict";

  const config = {
    apiBase: "",
    siteUrl: "https://liga-rk.github.io/liga-rk-26-2/fantasy/",
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
  let initialViewAfterLogin = initialViewFromUrl();

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
    rankingDivision: "elite",
    rankingScope: "championship",
    view: "home",
    market: { elite: [], ascension: [] },
    popular: { elite: [], ascension: [] },
    popularHighlights: { elite: {}, ascension: {} },
    popularRound: { elite: null, ascension: null },
    closedRanking: { elite: [], ascension: [] },
    marketOpen: { elite: false, ascension: false },
    marketAccessMode: { elite: "public", ascension: "public" },
    roundInfo: { elite: null, ascension: null },
    lineups: { elite: emptyLineup(), ascension: emptyLineup() },
    teamName: "Meu Time RK",
    userName: "",
    isAdmin: false,
    canControlMarket: false,
    marketControlBusy: false,
    patrimony: { elite: null, ascension: null },
    draftData: { elite: null, ascension: null },
    draftDialog: { item: null, mode: "NONE", championId: "", mapNumber: null, editing: false },
    autoLineup: { strategy: "balanced", preview: null },
    autoDraftReview: { active: false, roles: [], completed: 0, total: 0 },
    feedbackBusy: false,
    loaded: false
  };

  let preparedShare = null;
  let marketStatusTimer = null;

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
    autoLineup: document.getElementById("auto-lineup"),
    autoLineupDialog: document.getElementById("auto-lineup-dialog"),
    autoLineupForm: document.getElementById("auto-lineup-form"),
    closeAutoLineupDialog: document.getElementById("close-auto-lineup-dialog"),
    autoStrategyOptions: document.querySelectorAll("[data-auto-strategy]"),
    autoIncludeReserve: document.getElementById("auto-include-reserve"),
    autoLineupPreview: document.getElementById("auto-lineup-preview"),
    autoPreviewStrategy: document.getElementById("auto-preview-strategy"),
    autoLineupFeedback: document.getElementById("auto-lineup-feedback"),
    applyAutoLineup: document.getElementById("apply-auto-lineup"),
    applyAutoLineupWithDraft: document.getElementById("apply-auto-lineup-with-draft"),
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
    calculationDialog: document.getElementById("calculation-dialog"),
    closeCalculationDialog: document.getElementById("close-calculation-dialog"),
    calculationDialogTitle: document.getElementById("calculation-dialog-title"),
    calculationDialogSubtitle: document.getElementById("calculation-dialog-subtitle"),
    calculationDialogBody: document.getElementById("calculation-dialog-body"),
    saveLineup: document.getElementById("save-lineup"),
    captainReminder: document.getElementById("captain-reminder"),
    lineupMessage: document.getElementById("lineup-message"),
    renameTeam: document.getElementById("rename-team"),
    fantasyTeamName: document.getElementById("fantasy-team-name"),
    accountButton: document.getElementById("account-button"),
    accountLabel: document.getElementById("account-label"),
    feedbackHeaderButton: document.getElementById("feedback-header-button"),
    adminPanelLink: document.getElementById("admin-panel-link"),
    homeLoginButton: document.getElementById("home-login-button"),
    accountDialog: document.getElementById("account-dialog"),
    demoUserName: document.getElementById("demo-user-name"),
    confirmDemoUser: document.getElementById("confirm-demo-user"),
    rankingScope: document.getElementById("ranking-scope"),
    rankingDivisionTabs: document.querySelectorAll("[data-ranking-division]"),
    rankingBody: document.getElementById("ranking-body"),
    rankingWealthHeader: document.getElementById("ranking-wealth-header"),
    rankingHelper: document.getElementById("ranking-helper"),
    marketStatus: document.getElementById("market-status"),
    marketDeadline: document.getElementById("market-deadline"),
    marketAdminControl: document.getElementById("market-admin-control"),
    marketAdminToggle: document.getElementById("market-admin-toggle"),
    marketAdminFeedback: document.getElementById("market-admin-feedback"),
    marketFeedbackButton: document.getElementById("market-feedback-button"),
    feedbackDialog: document.getElementById("feedback-dialog"),
    feedbackForm: document.getElementById("feedback-form"),
    closeFeedbackDialog: document.getElementById("close-feedback-dialog"),
    feedbackCategory: document.getElementById("feedback-category"),
    feedbackSubject: document.getElementById("feedback-subject"),
    feedbackMessage: document.getElementById("feedback-message"),
    feedbackContext: document.getElementById("feedback-context"),
    feedbackFormStatus: document.getElementById("feedback-form-status"),
    submitFeedback: document.getElementById("submit-feedback"),
    marketDashboard: document.getElementById("market-dashboard"),
    marketClosed: document.getElementById("market-closed"),
    closedMarketMessage: document.getElementById("closed-market-message"),
    closedMarketDetail: document.getElementById("closed-market-detail"),
    closedHighlights: document.getElementById("closed-highlights"),
    closedLineups: document.getElementById("closed-lineups"),
    closedRanking: document.getElementById("closed-ranking"),
    marketPanel: document.getElementById("market-panel"),
    popularStrip: document.getElementById("popular-strip"),
    popularList: document.getElementById("popular-list"),
    popularDivision: document.getElementById("popular-division"),
    closedActions: document.querySelectorAll("[data-closed-action]"),
    roleShortcuts: document.querySelectorAll("[data-role-shortcut]"),
    backToTop: document.getElementById("back-to-top"),
    patrimonyProfile: document.getElementById("patrimony-profile"),
    patrimonySummaryBody: document.getElementById("patrimony-summary-body")
    ,draftPredictionDialog: document.getElementById("draft-prediction-dialog")
    ,draftPredictionForm: document.getElementById("draft-prediction-form")
    ,closeDraftPredictionDialog: document.getElementById("close-draft-prediction-dialog")
    ,draftPredictionPlayer: document.getElementById("draft-prediction-player")
    ,draftModeOptions: document.querySelectorAll("[data-draft-mode]")
    ,draftChampionSection: document.getElementById("draft-champion-section")
    ,draftChampionSearch: document.getElementById("draft-champion-search")
    ,draftChampionSort: document.getElementById("draft-champion-sort")
    ,draftChampionCount: document.getElementById("draft-champion-count")
    ,draftChampionGrid: document.getElementById("draft-champion-grid")
    ,draftMapSection: document.getElementById("draft-map-section")
    ,draftMapOptions: document.getElementById("draft-map-options")
    ,draftPredictionPreview: document.getElementById("draft-prediction-preview")
    ,draftPredictionFeedback: document.getElementById("draft-prediction-feedback")
    ,draftFooterHint: document.getElementById("draft-footer-hint")
    ,confirmDraftPrediction: document.getElementById("confirm-draft-prediction")
  };

  init();

  async function init() {
    if (initialViewAfterLogin) setView(initialViewAfterLogin);
    await completeCloudLogin();
    if (initialViewAfterLogin) setView(initialViewAfterLogin);
    restoreLocalState();
    bindEvents();
    marketStatusTimer = window.setInterval(renderMarketShell, 30000);
    if (config.backendMode === "cloud") {
      await loadCloudAccount();
    }
    renderAccount();
    renderLineup();
    renderMarketShell();
    renderRanking();
    await loadMarket();
    if (config.backendMode === "cloud") {
      await Promise.all([loadCloudConfig("elite"), loadCloudConfig("ascension")]);
      await Promise.all([loadCloudDraftData("elite"), loadCloudDraftData("ascension")]);
      syncAllLineupsWithMarket();
      await Promise.all([loadCloudLineup("elite"), loadCloudLineup("ascension")]);
      syncAllLineupsWithMarket();
      await Promise.all([loadCloudRanking(), loadCloudPopular(state.division), loadCloudPatrimonyHistory()]);
      renderLineup();
      renderMarketShell();
      renderMarket();
    }
    if (initialAuthMessage) setMessage(initialAuthMessage, initialAuthError, !initialAuthError);
  }

  function initialViewFromUrl() {
    return new URLSearchParams(String(location.search || "")).get("view") === "market" ? "market" : "";
  }

  function bindEvents() {
    el.navButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    el.divisionTabs.forEach((button) => button.addEventListener("click", () => setDivision(button.dataset.division)));
    el.rankingDivisionTabs.forEach((button) => button.addEventListener("click", () => setRankingDivision(button.dataset.rankingDivision)));
    el.rankingScope.addEventListener("input", () => setRankingScope(el.rankingScope.value));
    [el.search, el.sortFilter].forEach((input) => input.addEventListener("input", renderMarket));
    el.roleFilter.addEventListener("input", () => setRoleFilter(el.roleFilter.value, { scroll: false }));
    el.roleShortcuts.forEach((button) => button.addEventListener("click", () => setRoleFilter(button.dataset.roleShortcut)));
    el.closedActions.forEach((button) => button.addEventListener("click", () => handleClosedAction(button.dataset.closedAction)));
    if (el.autoLineup) el.autoLineup.addEventListener("click", openAutoLineupDialog);
    if (el.closeAutoLineupDialog) el.closeAutoLineupDialog.addEventListener("click", closeAutoLineupDialog);
    if (el.autoLineupDialog) el.autoLineupDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeAutoLineupDialog();
    });
    el.autoStrategyOptions.forEach((button, index) => {
      button.addEventListener("click", () => selectAutoLineupStrategy(button.dataset.autoStrategy));
      button.addEventListener("keydown", (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        const buttons = Array.from(el.autoStrategyOptions);
        const target = buttons[(index + direction + buttons.length) % buttons.length];
        target.focus();
        selectAutoLineupStrategy(target.dataset.autoStrategy);
      });
    });
    if (el.autoIncludeReserve) el.autoIncludeReserve.addEventListener("change", calculateAutoLineupPreview);
    if (el.applyAutoLineup) el.applyAutoLineup.addEventListener("click", () => applyAutomaticLineup(false));
    if (el.applyAutoLineupWithDraft) el.applyAutoLineupWithDraft.addEventListener("click", () => applyAutomaticLineup(true));
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
    el.closeCalculationDialog.addEventListener("click", closeCalculationDialog);
    el.calculationDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeCalculationDialog();
    });
    if (el.closeDraftPredictionDialog) el.closeDraftPredictionDialog.addEventListener("click", closeDraftPredictionDialog);
    if (el.draftPredictionDialog) el.draftPredictionDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDraftPredictionDialog();
    });
    if (el.draftPredictionForm) el.draftPredictionForm.addEventListener("submit", confirmDraftPrediction);
    el.draftModeOptions.forEach((button, index) => {
      button.addEventListener("click", () => setDraftMode(button.dataset.draftMode));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
        const buttons = Array.from(el.draftModeOptions);
        const target = buttons[(index + direction + buttons.length) % buttons.length];
        target.focus();
        setDraftMode(target.dataset.draftMode);
      });
    });
    if (el.draftChampionSearch) el.draftChampionSearch.addEventListener("input", renderDraftChampionGrid);
    if (el.draftChampionSort) el.draftChampionSort.addEventListener("input", renderDraftChampionGrid);
    el.saveLineup.addEventListener("click", saveLineup);
    el.renameTeam.addEventListener("click", renameTeam);
    el.accountButton.addEventListener("click", handleAccountAction);
    el.homeLoginButton.addEventListener("click", startDiscordLogin);
    if (el.marketAdminToggle) el.marketAdminToggle.addEventListener("click", toggleMarketFromFantasy);
    [el.marketFeedbackButton, el.feedbackHeaderButton].filter(Boolean).forEach((button) => button.addEventListener("click", openFeedbackDialog));
    if (el.closeFeedbackDialog) el.closeFeedbackDialog.addEventListener("click", closeFeedbackDialog);
    if (el.feedbackDialog) el.feedbackDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeFeedbackDialog();
    });
    if (el.feedbackForm) el.feedbackForm.addEventListener("submit", sendFeedback);
    el.confirmDemoUser.addEventListener("click", confirmDemoUser);
    if (el.backToTop) {
      el.backToTop.addEventListener("click", scrollBackToTop);
      window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
      updateBackToTopVisibility();
    }
  }

  function updateBackToTopVisibility() {
    if (el.backToTop) el.backToTop.hidden = window.scrollY < 420;
  }

  function scrollBackToTop() {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const divisionTabs = state.view === "market" ? document.querySelector(".division-tabs") : null;
    if (divisionTabs) {
      divisionTabs.scrollIntoView({ behavior, block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior });
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
      console.warn("Fantasy RK: usando dados de demonstração.", error);
      const content = demoContent();
      state.market.elite = buildMarket(content.divisions.elite, "elite");
      state.market.ascension = buildMarket(content.divisions.ascension, "ascension");
      setMessage("A API oficial não respondeu; exibindo dados de demonstração.", false);
    }

    state.loaded = true;
    syncAllLineupsWithMarket();
    el.marketLoading.hidden = true;
    el.marketGrid.hidden = false;
    renderMarket();
    renderPopularPicks();
    renderLineup();
  }

  async function fetchCloudMarket(division) {
    const response = await apiFetch(`/api/fantasy/market?division=${encodeURIComponent(division)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(payload, `Mercado ${division} indisponível.`));
    const cloudMarket = (payload.market || []).map((item) => ({
      id: String(item.id),
      type: item.type === "team" ? "team" : "player",
      role: normalizeRole(item.role),
      name: cleanText(item.name),
      teamName: cleanText(item.teamName),
      teamTag: cleanText(item.teamTag).toUpperCase(),
      teamSlot: cleanText(item.teamSlot),
      logo: normalizeAssetPath(item.logo),
      artwork: normalizeAssetPath(item.artwork),
      riotId: cleanText(item.riotId),
      elo: cleanText(item.elo),
      tier: cleanText(item.tier),
      opgg: cleanText(item.opgg),
      price: roundMoney(item.price),
      previousPrice: Number.isFinite(Number(item.previousPrice)) ? roundMoney(item.previousPrice) : roundMoney(item.price),
      priceDelta: roundMoney(Number(item.price) - Number(Number.isFinite(Number(item.previousPrice)) ? item.previousPrice : item.price)),
      opponentName: cleanText(item.opponentName),
      opponentTag: cleanText(item.opponentTag).toUpperCase(),
      opponentSlot: cleanText(item.opponentSlot),
      matchup: cleanText(item.matchup),
      average: roundMoney(item.average),
      recentPoints: normalizeRecentPoints(item.recentPoints),
      maintenanceScore: Number.isFinite(Number(item.maintenanceScore))
        ? roundMoney(item.maintenanceScore)
        : null,
      scoreDetails: objectValue(item.scoreDetails),
      valuationDetails: objectValue(item.valuationDetails),
      isStarter: item.type === "team" ? true : item.isStarter !== false,
      rosterStatus: cleanText(item.rosterStatus) || (item.type === "team" ? "team" : item.isStarter === false ? "reserve" : "starter"),
      selectable: item.selectable !== false,
      availabilityStatus: cleanText(item.availabilityStatus),
      availabilityLabel: cleanText(item.availabilityLabel)
    }));
    return cloudMarket;
  }

  async function loadCloudDraftData(division) {
    try {
      const response = await apiFetch(`/api/fantasy/draft?division=${encodeURIComponent(division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Palpite de Draft indisponível."));
      state.draftData[division] = {
        enabled: payload.enabled === true,
        roundNumber: Math.trunc(Number(payload.roundNumber) || 0),
        config: objectValue(payload.config),
        snapshot: objectValue(payload.snapshot),
        champions: Array.isArray(payload.champions) && payload.champions.length
          ? payload.champions
          : Array.from(window.FANTASY_RK_CHAMPIONS || []),
        teamSeriesFormats: objectValue(payload.teamSeriesFormats)
      };
    } catch (error) {
      console.warn(`Palpite de Draft ${division} indisponível.`, error);
      state.draftData[division] = { enabled: false, champions: [], snapshot: {}, teamSeriesFormats: {} };
    }
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
        previousPrice: roundMoney(9 + (teamSeed % 700) / 100),
        priceDelta: 0,
        matchup: "Confronto a definir",
        average: roundMoney(8 + (teamSeed % 900) / 100),
        recentPoints: demoRecentPoints(teamSeed)
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
          previousPrice: roundMoney(roleBase + (seed % 800) / 100),
          priceDelta: 0,
          matchup: "Confronto a definir",
          average: roundMoney(7 + (seed % 1300) / 100),
          recentPoints: demoRecentPoints(seed)
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
      .filter((item) => role === "ALL" || (item.isStarter !== false && item.role === role))
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

    try {
      const players = items.filter((item) => item.role !== "TEAM" && item.isStarter !== false);
      const reserves = items.filter((item) => item.role !== "TEAM" && item.isStarter === false);
      const teams = items.filter((item) => item.role === "TEAM");
      const sections = [];
      if (players.length) {
        const title = role === "ALL" ? "Titulares dos elencos" : ROLE_LABELS[role];
        sections.push(marketSection(title, role === "ALL" ? "TOP" : role, players, selectedIds, lineup, reserveId, false));
      }
      if (reserves.length) sections.push(marketSection("Reservas dos elencos", "SUP", reserves, selectedIds, lineup, reserveId, false, true));
      if (teams.length) sections.push(marketSection("Equipes", "TEAM", teams, selectedIds, lineup, reserveId, true));
      el.marketGrid.replaceChildren(...sections);
    } catch (error) {
      console.error("Fantasy RK: falha ao montar o mercado.", error);
      el.marketGrid.replaceChildren();
      const errorBox = document.createElement("div");
      errorBox.className = "empty-state";
      errorBox.textContent = "Não foi possível montar a lista agora. Atualize a página e tente novamente.";
      el.marketGrid.appendChild(errorBox);
      return;
    }
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Nenhum jogador encontrado com esses filtros.";
      el.marketGrid.appendChild(empty);
    }
  }

  function renderPopularPicks() {
    if (!el.popularList) return;
    const divisionLabel = state.division === "elite" ? "Divisão Elite" : "Divisão Ascensão";
    if (el.popularDivision) {
      const round = state.roundInfo[state.division] || state.popularRound[state.division];
      el.popularDivision.textContent = round && round.name ? `${divisionLabel} · ${round.name}` : divisionLabel;
    }

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
    updateMarketStatus();
    renderMarketAdminControl();
    renderFeedbackAccess();
    const open = isMarketOpen();
    if (el.popularStrip) {
      el.popularStrip.hidden = !open;
      el.popularStrip.classList.toggle("closed-hidden", !open);
    }
    if (el.marketDashboard) el.marketDashboard.hidden = !open;
    if (el.marketClosed) el.marketClosed.hidden = open;
    if (!open) {
      const round = state.roundInfo[state.division];
      if (el.closedMarketMessage) {
        el.closedMarketMessage.textContent = "As escalações desta rodada foram bloqueadas. Estamos atualizando jogos, pontuações e preços.";
      }
      if (el.closedMarketDetail) el.closedMarketDetail.textContent = closedMarketDetail(round);
      renderClosedHighlights();
      renderClosedRanking();
    }
    renderClosedLineups();
  }

  function renderClosedHighlights() {
    if (!el.closedHighlights) return;
    const highlights = state.popularHighlights[state.division] || {};
    const cards = [
      { key: "player", label: "Jogador mais escalado", empty: "Aguardando escolhas" },
      { key: "captain", label: "Capitão mais escolhido", empty: "Aguardando capitães" },
      { key: "team", label: "Equipe mais escolhida", empty: "Aguardando equipes" }
    ];
    el.closedHighlights.replaceChildren(...cards.map(({ key, label, empty }) => closedHighlightCard(label, highlights[key], empty)));
  }

  function closedHighlightCard(label, item, emptyText) {
    const card = document.createElement("article");
    card.className = `closed-highlight-card${item ? "" : " empty"}`;
    if (!item) {
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const strong = document.createElement("strong");
      strong.textContent = emptyText;
      const small = document.createElement("small");
      small.textContent = "Aparece quando houver escalações salvas para esta rodada.";
      card.append(labelEl, strong, small);
      return card;
    }
    const logo = document.createElement("div");
    logo.className = "closed-highlight-logo";
    logo.appendChild(createLogo(item));
    const info = document.createElement("div");
    info.className = "closed-highlight-info";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = item.name;
    const small = document.createElement("small");
    const itemMeta = item.role === "TEAM"
      ? cleanText(item.teamName || item.teamTag)
      : `${ROLE_LABELS[item.role] || item.role} · ${item.teamTag}`;
    const picks = Math.max(0, Math.trunc(Number(item.picks) || 0));
    const picksLabel = picks ? `${picks} ${picks === 1 ? "escalação" : "escalações"}` : "";
    small.textContent = [picksLabel, itemMeta].filter(Boolean).join(" · ");
    info.append(labelEl, strong, small);
    card.append(logo, info);
    return card;
  }

  function renderClosedRanking() {
    if (!el.closedRanking) return;
    const rows = state.closedRanking[state.division] || [];
    if (!rows.length) {
      el.closedRanking.innerHTML = `<p class="closed-lineup-empty">O ranking aparecerá aqui assim que houver pontuação processada.</p>`;
      return;
    }
    el.closedRanking.innerHTML = `
      <table class="closed-ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>Jogador</th>
            <th class="number-cell">Rodada</th>
            <th class="number-cell">Total</th>
            <th class="number-cell">Patrimônio</th>
          </tr>
        </thead>
        <tbody>
          ${rows.slice(0, 10).map((row) => `
            <tr>
              <td>${Number(row.position) || "-"}</td>
              <td>${escapeHtml(row.teamName || "-")}</td>
              <td>${escapeHtml(row.manager || "-")}</td>
              <td class="number-cell">${formatNumber(row.roundPoints)}</td>
              <td class="number-cell">${formatNumber(row.totalPoints)}</td>
              <td class="number-cell">RK$ ${formatMoney(Number(row.wealthCents || 0) / 100)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
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
        const draft = role !== "TEAM" && draftPredictionEnabled(division)
          ? ` · ${draftPredictionSummaryForDivision(lineup.draftPredictions[role], division)}`
          : "";
        team.textContent = `${item.teamTag} · RK$ ${formatMoney(item.price)}${draft}`;
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
        team.textContent = `RESERVA DO FANTASY · ${lineup.reserve.teamTag}`;
        reserve.append(roleLabel, player, team);
        list.appendChild(reserve);
      }
      card.appendChild(list);
      return card;
    }));
  }

  function marketSection(title, role, items, selectedIds, lineup, reserveId, teamSection, realReserveSection = false) {
    const section = document.createElement("section");
    section.className = `market-section${teamSection ? " team-market-section" : ""}${realReserveSection ? " reserve-market-section" : ""}`;
    const heading = document.createElement("h3");
    heading.className = "market-section-title";
    const icon = document.createElement("img");
    icon.src = ROLE_ASSETS[role];
    icon.alt = "";
    const label = document.createTextNode(title);
    const count = document.createElement("span");
    const availableCount = items.filter((item) => item.selectable !== false).length;
    count.textContent = availableCount === items.length
      ? `${items.length} ${items.length === 1 ? "opção" : "opções"}`
      : `${availableCount} disponíveis de ${items.length}`;
    heading.append(icon, label, count);
    const cards = document.createElement("div");
    cards.className = "market-cards";
    cards.replaceChildren(...items.map((item) => {
      const selected = selectedIds.has(item.id);
      const reserveSelected = reserveId === item.id;
      const reserveError = !selected && !reserveSelected ? reserveValidationMessage(item, lineup) : "";
      const reserveEligible = item.selectable !== false && item.type === "player" && !selected && !reserveSelected && !reserveError;
      const roleComplete = el.roleFilter.value === "ALL" && Boolean(lineup.slots[item.role]) && !selected && !reserveEligible;
      return marketCard(item, selected, roleComplete, reserveSelected, reserveError, reserveEligible);
    }));
    section.append(heading);
    if (realReserveSection) {
      const explanation = document.createElement("p");
      explanation.className = "reserve-market-help";
      explanation.textContent = "Estes atletas integram o banco das equipes classificadas e podem ocupar somente a vaga de reserva do seu time no Fantasy.";
      section.appendChild(explanation);
    }
    section.appendChild(cards);
    return section;
  }

  function marketCard(item, selected, roleComplete, reserveSelected, reserveError = "", reserveEligible = false) {
    const card = document.createElement("article");
    const unavailable = item.selectable === false;
    const realReserve = item.type === "player" && item.isStarter === false;
    card.className = `player-card${selected ? " selected" : ""}${roleComplete ? " role-complete" : ""}${reserveSelected ? " reserve-selected" : ""}${reserveEligible ? " reserve-eligible" : ""}${realReserve ? " real-roster-reserve" : ""}${unavailable ? " unavailable" : ""}`;

    const logo = createLogo(item);
    const meta = document.createElement("div");
    meta.className = "player-meta";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const rosterBadge = document.createElement("small");
    rosterBadge.className = `roster-status-badge ${realReserve ? "reserve" : "starter"}`;
    rosterBadge.textContent = realReserve ? "RESERVA DO ELENCO" : "TITULAR DO ELENCO";
    const team = document.createElement("span");
    team.textContent = `${realReserve ? "RESERVA FLEX" : ROLE_LABELS[item.role]} · ${item.teamName || item.teamTag}`;
    const matchup = document.createElement("small");
    matchup.className = "matchup";
    matchup.textContent = unavailable ? item.availabilityLabel : matchupLabel(item);
    if (unavailable) matchup.classList.add("availability-status", item.availabilityStatus || "unavailable");
    const stats = document.createElement("div");
    stats.className = "player-stats";
    const recent = item.recentPoints && item.recentPoints.length
      ? item.recentPoints.map((point) => formatNumber(point)).join(" · ")
      : "indisponível na última rodada";
    stats.innerHTML = `<span>Média: ${formatNumber(item.average)}</span><span>Performance recente: ${escapeHtml(recent)}</span>`;
    meta.append(name);
    if (item.type === "player") meta.appendChild(rosterBadge);
    meta.append(team, matchup, stats);
    const breakdown = fantasyBreakdown(item);
    if (breakdown) meta.appendChild(breakdown);

    const price = document.createElement("div");
    price.className = "player-price";
    price.innerHTML = `<strong><b>RK$</b> ${formatMoney(item.price)}</strong>`;
    const change = priceChangeElement(item);
    if (change) price.appendChild(change);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "buy-button";
    button.textContent = selected ? "Remover" : (unavailable ? "Indisponível nesta rodada" : realReserve ? "Somente como reserva" : "Escalar");
    button.disabled = (unavailable && !selected) || (realReserve && !selected);
    button.title = unavailable ? item.availabilityLabel : realReserve ? "Este atleta só pode ocupar a vaga de reserva do Fantasy." : "Escalar";
    button.addEventListener("click", () => selected ? removeItem(item.role) : addItem(item));

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.appendChild(button);
    if (item.type === "player") {
      const reserveButton = document.createElement("button");
      reserveButton.type = "button";
      reserveButton.className = "reserve-button";
      reserveButton.textContent = reserveSelected ? "Remover reserva" : "Reserva";
      reserveButton.disabled = unavailable || (selected && !reserveSelected) || Boolean(reserveError);
      reserveButton.title = selected && !reserveSelected ? "Remova dos titulares antes de usar como reserva." : (reserveError || "Escolher como reserva");
      reserveButton.addEventListener("click", () => reserveSelected ? removeReserve() : setReserve(item));
      actions.appendChild(reserveButton);
    }

    card.append(logo, meta, price, actions);
    return card;
  }

  function fantasyBreakdown(item) {
    const score = objectValue(item.scoreDetails);
    const valuation = objectValue(item.valuationDetails);
    const dynamicValuation = valuation.formulaId === "fantasy-v3-dynamic" || Number(valuation.formulaVersion) === 3;
    const scoreAvailable = Number(score.formulaVersion) === 2 && (score.jogou === true || Number(score.mapasDisputados) > 0);
    const valuationAvailable = dynamicValuation && valuation.played === true;
    const container = document.createElement("div");
    container.className = "fantasy-breakdown";
    if (!scoreAvailable && !valuationAvailable) {
      const warning = document.createElement("span");
      warning.className = "calculation-unavailable";
      warning.textContent = "Estatística da última rodada indisponível.";
      container.appendChild(warning);
      return container;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calculation-button";
    button.textContent = "Ver cálculo da última rodada";
    button.addEventListener("click", () => openCalculationDialog(item));
    container.appendChild(button);
    return container;
  }

  function openCalculationDialog(item) {
    const score = objectValue(item.scoreDetails);
    const valuation = objectValue(item.valuationDetails);
    const scoreAvailable = Number(score.formulaVersion) === 2 && (score.jogou === true || Number(score.mapasDisputados) > 0);
    const valuationAvailable = (valuation.formulaId === "fantasy-v3-dynamic" || Number(valuation.formulaVersion) === 3) && valuation.played === true;
    el.calculationDialogTitle.textContent = item.name;
    el.calculationDialogSubtitle.textContent = `${ROLE_LABELS[item.role]} · ${item.teamName || item.teamTag} · última rodada processada`;
    el.calculationDialogBody.replaceChildren();
    if (scoreAvailable) {
      const section = calculationSection("Pontuação da rodada");
      const list = document.createElement("ul");
      appendBreakdownLine(list, "Média dos mapas", formatNumber(score.pontuacaoMediaMapas));
      appendBreakdownLine(list, "Vitória da série", signedNumber(score.bonusVitoriaSerie));
      appendBreakdownLine(list, "Série perfeita", signedNumber(score.bonusSeriePerfeita));
      appendBreakdownLine(list, "Consistência", signedNumber(score.bonusConsistencia));
      appendBreakdownLine(list, "Domínio de MVP", signedNumber(score.bonusMvpSerie));
      appendBreakdownLine(list, "Série sem mortes", signedNumber(score.bonusSemMortes));
      appendBreakdownLine(list, "Total oficial", formatNumber(score.pontuacaoOficial), true);
      section.appendChild(list);
      el.calculationDialogBody.appendChild(section);
    }
    if (valuationAvailable && item.type === "team") {
      const section = calculationSection("Pontuação da equipe");
      const list = document.createElement("ul");
      appendBreakdownLine(list, "Média oficial da rodada", formatNumber(valuation.roundPoints), true);
      appendBreakdownLine(list, "Mapas disputados", String(Math.max(0, Number(valuation.games) || 0)));
      section.appendChild(list);
      el.calculationDialogBody.appendChild(section);
    }
    if (valuationAvailable) {
      const section = calculationSection("Mercado");
      const list = document.createElement("ul");
      appendBreakdownLine(list, "Preço anterior", `RK$ ${formatMoney(valuation.currentPrice)}`);
      appendBreakdownLine(list, "Pontuação esperada", formatNumber(valuation.expectedScore));
      appendBreakdownLine(list, "Desempenho ajustado",
        valuation.adjustedPerformance == null ? "não atuou" : formatNumber(valuation.adjustedPerformance));
      appendBreakdownLine(list, "Média recente",
        valuation.recentAverage == null ? "sem histórico" : formatNumber(valuation.recentAverage));
      appendBreakdownLine(list, "Média da temporada",
        valuation.historicalAverage == null ? "sem histórico" : formatNumber(valuation.historicalAverage));
      appendBreakdownLine(list, "Pontuação realizada", formatNumber(valuation.roundPoints));
      appendBreakdownLine(list, "Fator de participação", `${formatNumber(Number(valuation.participationFactor) * 100)}%`);
      appendBreakdownLine(list, "Variação", signedMoney(valuation.delta));
      appendBreakdownLine(list, "Novo preço", `RK$ ${formatMoney(valuation.newPrice)}`, true);
      section.appendChild(list);
      el.calculationDialogBody.appendChild(section);
    }
    if (!scoreAvailable && !valuationAvailable) {
      const warning = document.createElement("p");
      warning.className = "calculation-unavailable";
      warning.textContent = "Estatística da última rodada indisponível.";
      el.calculationDialogBody.appendChild(warning);
    }
    if (!el.calculationDialog.open) el.calculationDialog.showModal();
  }

  function calculationSection(title) {
    const section = document.createElement("section");
    section.className = "calculation-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.appendChild(heading);
    return section;
  }

  function closeCalculationDialog() {
    if (el.calculationDialog.open) el.calculationDialog.close();
  }

  function appendBreakdownLine(list, label, value, total = false) {
    const line = document.createElement("li");
    if (total) line.className = "breakdown-total";
    const name = document.createElement("span");
    name.textContent = label;
    const result = document.createElement("b");
    result.textContent = value;
    line.append(name, result);
    list.appendChild(line);
  }

  function matchupLabel(item) {
    if (item.matchup) return item.matchup;
    if (item.opponentTag || item.opponentName) return `vs ${item.opponentTag || item.opponentName}`;
    return "Confronto a definir";
  }

  function priceChangeElement(item) {
    const delta = Number.isFinite(Number(item.priceDelta))
      ? Number(item.priceDelta)
      : Number(item.price) - Number(item.previousPrice);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) return null;
    const span = document.createElement("span");
    span.className = `price-change ${delta > 0 ? "up" : "down"}`;
    span.title = delta > 0 ? "Valorizou desde a última rodada" : "Desvalorizou desde a última rodada";
    span.textContent = `${delta > 0 ? "▲" : "▼"} RK$ ${formatMoney(Math.abs(delta))}`;
    return span;
  }

  function renderLineup() {
    const lineup = currentLineup();
    syncLineupWithMarket(state.division);
    el.lineupSlots.replaceChildren(...ROLE_ORDER.map((role) => lineupSlot(role, lineup.slots[role])), reserveSlot(lineup.reserve));
    const spent = lineupCurrentValue(lineup);
    const selected = Object.values(lineup.slots).filter(Boolean).length;
    el.budgetTotal.textContent = formatMoney(lineupPatrimony(lineup));
    el.budgetSpent.textContent = formatMoney(spent);
    el.budgetRemaining.textContent = formatMoney(lineupCash(lineup));
    el.selectedCount.textContent = `${selected}/6${lineup.reserve ? " + reserva" : ""}`;
    el.fantasyTeamName.textContent = state.teamName;
    const reserveError = lineup.reserve && selected === 6 ? reserveValidationMessage(lineup.reserve, lineup) : "";
    const closed = !isMarketOpen();
    const overBudget = lineupStarterPurchaseCost(lineup) > config.budget + 0.001;
    const missingDraftPrediction = draftPredictionEnabled() && PLAYER_ROLES.some((role) => {
      const item = lineup.slots[role];
      const prediction = lineup.draftPredictions[role];
      return Boolean(item) && (!prediction || prediction.playerAssetId !== item.id);
    });
    el.saveLineup.disabled = closed || selected !== 6 || !lineup.captainId || overBudget || Boolean(reserveError) || missingDraftPrediction;
    el.saveLineup.textContent = closed ? "Mercado fechado" : (lineup.saved ? "Atualizar escalação" : "Salvar escalação");
    if (el.autoLineup) el.autoLineup.disabled = closed || !state.loaded;
    el.shareLineup.disabled = selected === 0;
    el.captainReminder.hidden = selected !== 6 || Boolean(lineup.captainId);
    if (!closed && selected === 6 && overBudget) {
      setMessage(`Sua escalação está em RK$ ${formatMoney(spent)} após a atualização dos preços. Troque uma ou mais escolhas para ficar dentro do limite de RK$ ${formatMoney(config.budget)}.`, true);
    } else if (el.lineupMessage.textContent.includes("após a atualização dos preços")) {
      setMessage("", false);
    }
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
    badge.className = `role-badge${item ? " selected-item-badge" : ""}`;
    if (item) {
      badge.appendChild(createLogo(item));
    } else {
      const roleIcon = document.createElement("img");
      roleIcon.src = ROLE_ASSETS[role];
      roleIcon.alt = "";
      badge.appendChild(roleIcon);
    }

    const info = document.createElement("div");
    info.className = "slot-info";
    const strong = document.createElement("strong");
    strong.textContent = item ? item.name : `Escolha ${ROLE_LABELS[role]}`;
    const detail = document.createElement("span");
    detail.textContent = item ? `${item.teamTag} · RK$ ${formatMoney(item.price)}` : "Vaga disponível";
    info.append(strong, detail);
    if (item && role !== "TEAM" && draftPredictionEnabled()) {
      const prediction = currentLineup().draftPredictions[role];
      const summary = document.createElement("span");
      summary.className = "lineup-draft-summary";
      summary.textContent = draftPredictionSummary(prediction);
      info.appendChild(summary);
    }
    selector.append(badge, info);

    const actions = document.createElement("div");
    actions.className = "slot-actions";
    if (item && role !== "TEAM") {
      if (draftPredictionEnabled() && isMarketOpen()) {
        const editDraft = document.createElement("button");
        editDraft.type = "button";
        editDraft.className = "draft-edit-button";
        editDraft.title = "Editar Palpite de Draft";
        editDraft.textContent = "🎯";
        editDraft.addEventListener("click", () => openDraftPredictionDialog(item, true));
        actions.appendChild(editDraft);
      }
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

  function draftPredictionSummary(prediction) {
    return draftPredictionSummaryForDivision(prediction, state.division);
  }

  function draftPredictionSummaryForDivision(prediction, division) {
    if (!prediction || prediction.mode === "NONE") return "🎯 Sem Palpite de Draft";
    const champion = (state.draftData[division]?.champions || []).find((item) => item.id === prediction.championId);
    const name = champion?.name || prediction.championId || "Campeão";
    const map = prediction.mode === "PRECISE" && prediction.mapNumber ? ` · Mapa ${prediction.mapNumber}` : "";
    return `🎯 ${name}${map} · ${prediction.mode === "PRECISE" ? "Preciso" : "Simples"}`;
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
    badge.className = `role-badge reserve-badge${item ? " selected-item-badge" : ""}`;
    if (item) {
      badge.appendChild(createLogo(item));
    } else {
      badge.textContent = "R";
    }

    const info = document.createElement("div");
    info.className = "slot-info";
    const strong = document.createElement("strong");
    strong.textContent = item ? item.name : "Escolha reserva";
    const detail = document.createElement("span");
    detail.textContent = item
      ? `RESERVA DO FANTASY · ${item.teamTag} · RK$ ${formatMoney(item.price)}`
      : selected === 6
        ? `Pode custar até RK$ ${formatMoney(budget)}`
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
    if (item.selectable === false) {
      setMessage(item.availabilityLabel || "Este ativo não pode ser escalado nesta rodada.", true);
      return;
    }
    if (item.type === "player" && item.isStarter === false) {
      setMessage(`${item.name} é reserva do elenco real e só pode ocupar a vaga de reserva do Fantasy.`, true);
      return;
    }
    const lineup = currentLineup();
    const replacing = lineup.slots[item.role];
    const nextCost = lineupStarterPurchaseCost(lineup) - (replacing ? itemPurchasePrice(replacing) : 0) + Number(item.price || 0);
    if (nextCost > config.budget + 0.001) {
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
    if (item.type === "player" && draftPredictionEnabled()) {
      openDraftPredictionDialog(item);
      return;
    }
    commitStarterItem(item, null);
  }

  function commitStarterItem(item, prediction) {
    const lineup = currentLineup();
    const replacing = lineup.slots[item.role];
    lineup.slots[item.role] = item;
    if (item.type === "player") {
      if (prediction) lineup.draftPredictions[item.role] = prediction;
      else delete lineup.draftPredictions[item.role];
    }
    if (lineup.reserve && lineup.reserve.id === item.id) lineup.reserve = null;
    if (replacing && lineup.captainId === replacing.id) lineup.captainId = "";
    const removedReserve = clearInvalidReserveIfComplete(lineup);
    lineup.saved = false;
    persistLocalState();
    setMessage(removedReserve ? `${item.name} foi adicionado. ${removedReserve} saiu da reserva por não caber mais na regra.` : `${item.name} foi adicionado à escalação.`, false, true);
    const nextRole = ROLE_ORDER.find((role) => !lineup.slots[role]);
    setRoleFilter(nextRole || "ALL", { scroll: false });
  }

  function draftPredictionEnabled(division = state.division) {
    const data = state.draftData[division];
    return Boolean(data?.enabled && Number(data.roundNumber) >= 4);
  }

  function openDraftPredictionDialog(item, editing = false) {
    const data = state.draftData[state.division];
    if (!data?.snapshot?.positionPickRates) {
      setMessage("O snapshot do Pick Rate ainda não está disponível. Atualize a página e tente novamente.", true);
      return;
    }
    const saved = currentLineup().draftPredictions[item.role];
    state.draftDialog = {
      item,
      mode: editing && saved?.mode ? saved.mode : "NONE",
      championId: editing ? cleanText(saved?.championId) : "",
      mapNumber: editing && saved?.mapNumber ? Number(saved.mapNumber) : null,
      editing
    };
    el.draftChampionSearch.value = "";
    el.draftChampionSort.value = "name";
    el.draftPredictionFeedback.textContent = "";
    const reviewStep = state.autoDraftReview.active
      ? `Palpite ${state.autoDraftReview.completed + 1} de ${state.autoDraftReview.total} · `
      : "";
    el.draftPredictionPlayer.textContent = `${reviewStep}${item.name} · ${ROLE_LABELS[item.role]} · ${item.teamName || item.teamTag}`;
    renderDraftDialog();
    if (!el.draftPredictionDialog.open) {
      el.draftPredictionDialog.showModal();
      window.requestAnimationFrame(() => {
        Array.from(el.draftModeOptions).find((button) => button.classList.contains("active"))?.focus();
      });
    }
  }

  function closeDraftPredictionDialog(options = {}) {
    if (el.draftPredictionDialog?.open) el.draftPredictionDialog.close();
    state.draftDialog = { item: null, mode: "NONE", championId: "", mapNumber: null, editing: false };
    if (state.autoDraftReview.active && options.cancelReview !== false) {
      state.autoDraftReview = { active: false, roles: [], completed: 0, total: 0 };
      setMessage("Revisão guiada encerrada. Os palpites não revisados continuam em “Não dar palpite”, sem risco de penalidade.", false, true);
    }
  }

  function setDraftMode(mode) {
    const normalized = ["NONE", "SIMPLE", "PRECISE"].includes(mode) ? mode : "NONE";
    state.draftDialog.mode = normalized;
    el.draftPredictionFeedback.textContent = "";
    if (normalized === "NONE") {
      state.draftDialog.championId = "";
      state.draftDialog.mapNumber = null;
    } else if (normalized === "SIMPLE") {
      state.draftDialog.mapNumber = null;
    }
    renderDraftDialog();
  }

  function renderDraftDialog() {
    const mode = state.draftDialog.mode;
    el.draftPredictionForm.dataset.mode = mode;
    el.draftModeOptions.forEach((button) => {
      const active = button.dataset.draftMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    el.draftChampionSection.hidden = mode === "NONE";
    el.draftMapSection.hidden = mode !== "PRECISE";
    if (mode !== "NONE") renderDraftChampionGrid();
    renderDraftMapOptions();
    renderDraftPredictionPreview();
    renderDraftFooterState();
  }

  function currentDraftChampions() {
    const data = state.draftData[state.division] || {};
    const item = state.draftDialog.item;
    const role = item?.role;
    return (data.champions || Array.from(window.FANTASY_RK_CHAMPIONS || [])).map((champion) => {
      const pickRate = Math.max(0, Number(data.snapshot?.positionPickRates?.[role]?.[champion.id]) || 0);
      const band = draftPickBand(pickRate);
      const reward = draftReward(state.draftDialog.mode, draftSeriesFormat(item), band.multiplier);
      return { ...champion, pickRate, multiplier: band.multiplier, rarity: band.label, possibleReward: reward.possibleReward };
    });
  }

  function draftPickBand(pickRate) {
    const bands = state.draftData[state.division]?.config?.pickRateMultipliers || [
      { min: .25, multiplier: .7, label: "Meta absoluto" }, { min: .18, multiplier: .8, label: "Muito popular" },
      { min: .12, multiplier: .9, label: "Popular" }, { min: .08, multiplier: 1, label: "Normal" },
      { min: .05, multiplier: 1.15, label: "Diferencial" }, { min: .02, multiplier: 1.35, label: "Raro" },
      { min: 0, multiplier: 1.5, label: "Muito raro" }
    ];
    return bands.find((band) => Number(pickRate) >= Number(band.min)) || bands[bands.length - 1];
  }

  function draftSeriesFormat(item) {
    return state.draftData[state.division]?.teamSeriesFormats?.[item?.teamSlot] === "MD5" ? "MD5" : "MD3";
  }

  function draftReward(mode, format, multiplier) {
    if (mode === "NONE") return { baseReward: 0, possibleReward: 0, missPenalty: 0 };
    if (mode === "PRECISE") return { baseReward: 5, possibleReward: roundMoney(5 * multiplier), missPenalty: -2 };
    const baseReward = format === "MD5" ? 1.5 : 2;
    return { baseReward, possibleReward: roundMoney(baseReward * multiplier), missPenalty: -1 };
  }

  function renderDraftChampionGrid({ preserveScroll = false } = {}) {
    if (!el.draftChampionGrid || state.draftDialog.mode === "NONE") return;
    const previousScrollTop = preserveScroll ? el.draftChampionGrid.scrollTop : 0;
    const restoreFocus = preserveScroll && el.draftChampionGrid.contains(document.activeElement);
    const query = cleanText(el.draftChampionSearch.value).toLocaleLowerCase("pt-BR");
    const sort = el.draftChampionSort.value;
    const champions = currentDraftChampions()
      .filter((champion) => !query || champion.name.toLocaleLowerCase("pt-BR").includes(query))
      .sort((left, right) => {
        if (sort === "pick-desc") return right.pickRate - left.pickRate || left.name.localeCompare(right.name, "pt-BR");
        if (sort === "pick-asc") return left.pickRate - right.pickRate || left.name.localeCompare(right.name, "pt-BR");
        if (sort === "reward-desc") return right.possibleReward - left.possibleReward || left.name.localeCompare(right.name, "pt-BR");
        return left.name.localeCompare(right.name, "pt-BR");
      });
    if (el.draftChampionCount) el.draftChampionCount.textContent = `${champions.length} ${champions.length === 1 ? "campeão" : "campeões"}`;
    if (!champions.length) {
      const empty = document.createElement("p");
      empty.className = "draft-champion-empty";
      empty.textContent = "Nenhum campeão encontrado. Tente outro nome.";
      el.draftChampionGrid.replaceChildren(empty);
      return;
    }
    el.draftChampionGrid.replaceChildren(...champions.map((champion, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `draft-champion-card${state.draftDialog.championId === champion.id ? " active" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(state.draftDialog.championId === champion.id));
      button.setAttribute("aria-label", `${champion.name}, ${champion.rarity}, Pick Rate ${formatPercent(champion.pickRate)}, acerto vale ${formatMoney(champion.possibleReward)} pontos`);
      button.tabIndex = state.draftDialog.championId === champion.id || (!state.draftDialog.championId && index === 0) ? 0 : -1;
      button.title = champion.name;
      const image = document.createElement("img");
      image.src = champion.image;
      image.alt = "";
      image.loading = "lazy";
      const name = document.createElement("strong");
      name.textContent = champion.name;
      const rarity = document.createElement("span");
      rarity.textContent = champion.rarity;
      const rate = document.createElement("small");
      rate.textContent = `Pick Rate ${state.draftDialog.item.role}: ${formatPercent(champion.pickRate)} · ${formatMultiplier(champion.multiplier)}`;
      const reward = document.createElement("b");
      reward.textContent = `Acerto: +${formatMoney(champion.possibleReward)}`;
      button.append(image, name, rarity, rate, reward);
      button.addEventListener("click", () => {
        state.draftDialog.championId = champion.id;
        el.draftPredictionFeedback.textContent = "";
        renderDraftChampionGrid({ preserveScroll: true });
        renderDraftPredictionPreview();
        renderDraftFooterState();
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(el.draftChampionGrid.querySelectorAll(".draft-champion-card"));
        const currentIndex = buttons.indexOf(event.currentTarget);
        const columns = Math.max(1, getComputedStyle(el.draftChampionGrid).gridTemplateColumns.split(" ").length);
        const offset = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : 0;
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, currentIndex + offset));
        buttons.forEach((entry, entryIndex) => { entry.tabIndex = entryIndex === nextIndex ? 0 : -1; });
        buttons[nextIndex]?.focus();
      });
      return button;
    }));
    if (preserveScroll) {
      el.draftChampionGrid.scrollTop = previousScrollTop;
      if (restoreFocus) el.draftChampionGrid.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    }
  }

  function renderDraftMapOptions() {
    if (!el.draftMapOptions) return;
    const format = draftSeriesFormat(state.draftDialog.item);
    el.draftMapOptions.replaceChildren(...[1, 2, 3, 4, 5].map((mapNumber) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `draft-map-button${state.draftDialog.mapNumber === mapNumber ? " active" : ""}`;
      button.disabled = format === "MD3" && mapNumber > 3;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(state.draftDialog.mapNumber === mapNumber));
      button.textContent = `Mapa ${mapNumber}`;
      if (button.disabled) {
        const note = document.createElement("small");
        note.textContent = "Indisponível em MD3";
        button.appendChild(note);
      }
      button.addEventListener("click", () => {
        state.draftDialog.mapNumber = mapNumber;
        el.draftPredictionFeedback.textContent = "";
        renderDraftMapOptions();
        renderDraftPredictionPreview();
        renderDraftFooterState();
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(el.draftMapOptions.querySelectorAll(".draft-map-button:not(:disabled)"));
        const index = buttons.indexOf(event.currentTarget);
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
        buttons[(index + direction + buttons.length) % buttons.length]?.focus();
      });
      return button;
    }));
  }

  function draftPredictionFromDialog() {
    const { item, mode, championId, mapNumber } = state.draftDialog;
    if (mode === "NONE") return noDraftPrediction(item);
    const champion = currentDraftChampions().find((entry) => entry.id === championId);
    if (!champion) return null;
    const reward = draftReward(mode, draftSeriesFormat(item), champion.multiplier);
    return {
      playerAssetId: item.id, role: item.role, mode, championId,
      mapNumber: mode === "PRECISE" ? Number(mapNumber) || null : null,
      pickRatePosition: item.role, pickRateAtLock: champion.pickRate,
      multiplierAtLock: champion.multiplier, ...reward, status: "PENDING", resultScore: null
    };
  }

  function renderDraftPredictionPreview() {
    const prediction = draftPredictionFromDialog();
    const item = state.draftDialog.item;
    if (!prediction || !item) {
      el.draftPredictionPreview.innerHTML = `<h3>Seu palpite</h3><p>Escolha um campeão para visualizar a recompensa.</p>`;
      return;
    }
    const champion = currentDraftChampions().find((entry) => entry.id === prediction.championId);
    const modeLabel = prediction.mode === "NONE" ? "Não dar palpite" : prediction.mode === "SIMPLE" ? "Palpite Simples" : "Palpite Preciso";
    el.draftPredictionPreview.innerHTML = `
      <h3>Seu palpite</h3>
      <div class="draft-preview-grid">
        <div><span>Jogador</span><strong>${escapeHtml(item.name)}</strong></div>
        <div><span>Posição</span><strong>${escapeHtml(ROLE_LABELS[item.role])}</strong></div>
        <div><span>Modo</span><strong>${modeLabel}</strong></div>
        <div><span>Campeão</span><strong>${escapeHtml(champion?.name || "—")}</strong></div>
        ${prediction.mode === "PRECISE" ? `<div><span>Mapa</span><strong>${prediction.mapNumber || "—"}</strong></div>` : ""}
        ${prediction.mode !== "NONE" ? `<div><span>Pick Rate ${item.role}</span><strong>${formatPercent(prediction.pickRateAtLock)}</strong></div><div><span>Categoria</span><strong>${escapeHtml(champion?.rarity || "")}</strong></div><div><span>Multiplicador</span><strong>${formatMultiplier(prediction.multiplierAtLock)}</strong></div><div class="draft-preview-reward"><span>Se acertar</span><strong>+${formatMoney(prediction.possibleReward)} pts</strong></div><div><span>Se errar</span><strong>−${formatMoney(Math.abs(prediction.missPenalty))} pts</strong></div>` : `<div><span>Resultado</span><strong>0 ponto</strong></div>`}
      </div>`;
  }

  function renderDraftFooterState() {
    if (!el.confirmDraftPrediction || !el.draftFooterHint) return;
    const prediction = draftPredictionFromDialog();
    const editing = state.draftDialog.editing;
    let valid = Boolean(prediction);
    let hint = "Escolha como deseja participar do Palpite de Draft.";
    if (state.draftDialog.mode === "NONE") {
      hint = "Sem risco: esta escolha vale 0 ponto.";
    } else if (!prediction) {
      hint = state.draftDialog.mode === "PRECISE" ? "Escolha um campeão e depois o mapa exato." : "Escolha um campeão para continuar.";
    } else if (prediction.mode === "PRECISE" && !prediction.mapNumber) {
      valid = false;
      hint = "Campeão escolhido. Agora selecione o mapa exato.";
    } else {
      hint = `Acerto: +${formatMoney(prediction.possibleReward)} pts · Erro: −${formatMoney(Math.abs(prediction.missPenalty))} pts`;
    }
    el.confirmDraftPrediction.disabled = !valid;
    el.confirmDraftPrediction.textContent = state.autoDraftReview.active
      ? (state.autoDraftReview.roles.length ? "Confirmar e ir ao próximo" : "Concluir revisão")
      : (editing ? "Salvar alteração" : "Confirmar e escalar");
    if (state.autoDraftReview.active) {
      hint = `Palpite ${state.autoDraftReview.completed + 1} de ${state.autoDraftReview.total} · ${hint}`;
    }
    el.draftFooterHint.textContent = hint;
  }

  function confirmDraftPrediction(event) {
    event.preventDefault();
    const prediction = draftPredictionFromDialog();
    if (!prediction) {
      el.draftPredictionFeedback.textContent = "Escolha um campeão para continuar.";
      return;
    }
    if (prediction.mode === "PRECISE" && !prediction.mapNumber) {
      el.draftPredictionFeedback.textContent = "Escolha o mapa exato para continuar.";
      return;
    }
    const { item, editing } = state.draftDialog;
    if (editing) {
      const guidedReview = state.autoDraftReview.active;
      currentLineup().draftPredictions[item.role] = prediction;
      currentLineup().saved = false;
      persistLocalState();
      closeDraftPredictionDialog({ cancelReview: !guidedReview });
      renderLineup();
      if (guidedReview) {
        state.autoDraftReview.completed += 1;
        window.setTimeout(openNextAutomaticDraftReview, 0);
        return;
      }
      setMessage(`Palpite de Draft de ${item.name} atualizado.`, false, true);
      return;
    }
    closeDraftPredictionDialog();
    commitStarterItem(item, prediction);
  }

  function formatPercent(value) {
    return `${(Math.max(0, Number(value) || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
  }

  function formatMultiplier(value) {
    return `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
  }

  function removeItem(role) {
    const lineup = currentLineup();
    const removed = lineup.slots[role];
    if (!removed) return;
    lineup.slots[role] = null;
    delete lineup.draftPredictions[role];
    if (lineup.captainId === removed.id) lineup.captainId = "";
    lineup.saved = false;
    persistLocalState();
    setMessage(`${removed.name} foi removido.`, false);
    renderLineup();
    renderMarket();
  }

  function setReserve(item) {
    if (item.selectable === false) {
      setMessage(item.availabilityLabel || "Este jogador não pode ser reserva nesta rodada.", true);
      return;
    }
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

  function autoStrategyLabel(strategy) {
    return ({
      balanced: "Time equilibrado",
      average: "Maior média",
      recent: "Melhor fase recente",
      appreciation: "Maior valorização",
      value: "Apostas de valor",
      economic: "Orçamento econômico",
      random: "Time surpresa"
    })[strategy] || "Time equilibrado";
  }

  function openAutoLineupDialog() {
    if (!isMarketOpen()) {
      setMessage("A montagem automática só fica disponível enquanto o mercado estiver aberto.", true);
      return;
    }
    if (!state.loaded || !state.market[state.division]?.length) {
      setMessage("Aguarde o mercado terminar de carregar.", true);
      return;
    }
    if (!window.FANTASY_AUTO_LINEUP?.buildAutomaticLineup) {
      setMessage("O assistente de escalação não carregou. Atualize a página e tente novamente.", true);
      return;
    }
    state.autoLineup = { strategy: "balanced", preview: null };
    if (el.autoIncludeReserve) el.autoIncludeReserve.checked = true;
    selectAutoLineupStrategy("balanced");
    const hasDraft = draftPredictionEnabled();
    el.applyAutoLineup.textContent = hasDraft ? "Aplicar sem palpites" : "Aplicar time";
    el.applyAutoLineupWithDraft.hidden = !hasDraft;
    if (!el.autoLineupDialog.open) {
      el.autoLineupDialog.showModal();
      window.requestAnimationFrame(() => el.autoStrategyOptions[0]?.focus());
    }
  }

  function closeAutoLineupDialog() {
    if (el.autoLineupDialog?.open) el.autoLineupDialog.close();
    state.autoLineup.preview = null;
  }

  function selectAutoLineupStrategy(strategy) {
    state.autoLineup.strategy = strategy || "balanced";
    el.autoStrategyOptions.forEach((button) => {
      const active = button.dataset.autoStrategy === state.autoLineup.strategy;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    calculateAutoLineupPreview();
  }

  function calculateAutoLineupPreview() {
    const builder = window.FANTASY_AUTO_LINEUP?.buildAutomaticLineup;
    if (!builder) return;
    const result = builder({
      market: state.market[state.division],
      budget: config.budget,
      maxPlayersPerTeam: config.maxPlayersPerRealTeam,
      strategy: state.autoLineup.strategy,
      includeReserve: Boolean(el.autoIncludeReserve?.checked)
    });
    state.autoLineup.preview = result.ok ? result : null;
    renderAutoLineupPreview(result);
  }

  function renderAutoLineupPreview(result) {
    const valid = Boolean(result?.ok);
    el.applyAutoLineup.disabled = !valid;
    el.applyAutoLineupWithDraft.disabled = !valid;
    el.autoPreviewStrategy.textContent = autoStrategyLabel(state.autoLineup.strategy);
    el.autoLineupFeedback.classList.toggle("error", !valid);
    if (!valid) {
      el.autoLineupPreview.innerHTML = `<p class="auto-preview-empty">${escapeHtml(result?.error || "Não foi possível gerar uma sugestão agora.")}</p>`;
      el.autoLineupFeedback.textContent = "Revise o patrimônio ou tente outra estratégia.";
      return;
    }

    const entries = ROLE_ORDER.map((role) => ({ role, item: result.slots[role], reserve: false }));
    if (result.reserve) entries.push({ role: result.reserve.role, item: result.reserve, reserve: true });
    el.autoLineupPreview.innerHTML = `
      ${entries.map(({ role, item, reserve }) => {
        const captain = !reserve && String(item.id) === String(result.captainId);
        const source = item.type === "team" ? (itemArtworkPath(item) || item.logo) : item.logo;
        return `<article class="auto-preview-player${captain ? " captain" : ""}${reserve ? " reserve" : ""}">
          <div class="auto-preview-logo"><img src="${escapeHtml(source || ROLE_ASSETS[role])}" alt="" /></div>
          <div class="auto-preview-info">
            <strong>${escapeHtml(item.name)}${captain ? '<span class="auto-preview-tag">Capitão</span>' : ""}${reserve ? '<span class="auto-preview-tag">Reserva</span>' : ""}</strong>
            <span>${reserve ? "RESERVA DO FANTASY · " : `${escapeHtml(ROLE_LABELS[role] || role)} · `}${escapeHtml(item.teamTag || item.teamName)}</span>
          </div>
          <span class="auto-preview-price">RK$ ${formatMoney(item.price)}</span>
        </article>`;
      }).join("")}
      ${result.reserve ? "" : `<p class="auto-preview-empty">${el.autoIncludeReserve?.checked ? "Nenhum reserva cabe no saldo desta sugestão." : "Reserva automática desativada nesta sugestão."}</p>`}
      <div class="auto-preview-summary">
        <div><span>Patrimônio</span><strong>RK$ ${formatMoney(config.budget)}</strong></div>
        <div><span>Utilizado</span><strong>RK$ ${formatMoney(result.totalCost)}</strong></div>
        <div><span>Disponível</span><strong>RK$ ${formatMoney(result.remaining)}</strong></div>
      </div>`;
    el.autoLineupFeedback.textContent = draftPredictionEnabled()
      ? "Os cinco titulares começarão com “Não dar palpite” (0 ponto e sem penalidade). Você pode revisar cada um agora ou depois."
      : "Nada será alterado até você aplicar esta sugestão.";
  }

  function noDraftPrediction(item) {
    return {
      playerAssetId: item.id,
      role: item.role,
      mode: "NONE",
      championId: null,
      mapNumber: null,
      pickRatePosition: item.role,
      pickRateAtLock: null,
      multiplierAtLock: null,
      baseReward: 0,
      possibleReward: 0,
      missPenalty: 0,
      status: "NONE",
      resultScore: 0
    };
  }

  function applyAutomaticLineup(reviewDraft) {
    const suggestion = state.autoLineup.preview;
    if (!suggestion?.ok) return;
    if (!isMarketOpen()) {
      closeAutoLineupDialog();
      setMessage("O mercado fechou antes da aplicação. Nenhuma alteração foi feita.", true);
      renderMarketShell();
      return;
    }
    const lineup = emptyLineup();
    for (const role of ROLE_ORDER) {
      const item = suggestion.slots[role];
      lineup.slots[role] = { ...item, purchasePrice: roundMoney(item.price) };
    }
    lineup.reserve = suggestion.reserve ? { ...suggestion.reserve, purchasePrice: roundMoney(suggestion.reserve.price) } : null;
    lineup.captainId = suggestion.captainId;
    lineup.saved = false;
    if (draftPredictionEnabled()) {
      for (const role of PLAYER_ROLES) lineup.draftPredictions[role] = noDraftPrediction(lineup.slots[role]);
    }
    state.lineups[state.division] = lineup;
    persistLocalState();
    closeAutoLineupDialog();
    setRoleFilter("ALL", { scroll: false });
    renderLineup();
    renderMarket();
    if (reviewDraft && draftPredictionEnabled()) {
      startAutomaticDraftReview();
      return;
    }
    setMessage("Time automático aplicado. Confira as escolhas e clique em Salvar escalação para confirmar.", false, true);
  }

  function startAutomaticDraftReview() {
    const data = state.draftData[state.division];
    if (!data?.snapshot?.positionPickRates) {
      setMessage("Time aplicado com todos os Palpites de Draft em “Não dar palpite”. A revisão guiada está indisponível agora.", false, true);
      return;
    }
    state.autoDraftReview = { active: true, roles: [...PLAYER_ROLES], completed: 0, total: PLAYER_ROLES.length };
    openNextAutomaticDraftReview();
  }

  function openNextAutomaticDraftReview() {
    if (!state.autoDraftReview.active) return;
    const role = state.autoDraftReview.roles.shift();
    if (!role) {
      state.autoDraftReview = { active: false, roles: [], completed: 0, total: 0 };
      setMessage("Revisão dos cinco Palpites de Draft concluída. Confira o time e clique em Salvar escalação.", false, true);
      renderLineup();
      return;
    }
    const item = currentLineup().slots[role];
    if (!item) {
      openNextAutomaticDraftReview();
      return;
    }
    openDraftPredictionDialog(item, true);
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
    syncLineupWithMarket(state.division, { forceCurrentPrices: true });
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
    const currentCost = lineupCost(lineup);
    if (currentCost > config.budget) {
      setMessage(`Os preços do mercado foram atualizados e sua escalação agora custa RK$ ${formatNumber(currentCost)}. Troque um ou mais nomes para voltar ao limite de RK$ ${formatNumber(config.budget)}.`, true);
      renderLineup();
      renderMarket();
      return;
    }
    if (!state.userName && config.backendMode === "local") {
      handleAccountAction();
      setMessage("Identifique-se antes de salvar.", true);
      return;
    }
    const reserveError = lineup.reserve ? reserveValidationMessage(lineup.reserve, lineup) : "";
    if (reserveError) {
      setMessage(reserveError, true);
      return;
    }
    if (draftPredictionEnabled() && PLAYER_ROLES.some((role) => {
      const item = lineup.slots[role];
      const prediction = lineup.draftPredictions[role];
      return !item || !prediction || prediction.playerAssetId !== item.id;
    })) {
      setMessage("Confirme o Palpite de Draft de cada um dos cinco titulares, inclusive se escolher não dar palpite.", true);
      return;
    }

    const payload = {
      division: state.division,
      teamName: state.teamName,
      captainPlayerId: lineup.captainId,
      picks: items.map((item) => ({ id: item.id, role: item.role, price: item.price, teamSlot: item.teamSlot })),
      reserve: lineup.reserve ? { id: lineup.reserve.id, role: lineup.reserve.role, price: 0, teamSlot: lineup.reserve.teamSlot } : null,
      draftPredictions: PLAYER_ROLES.map((role) => lineup.draftPredictions[role]).filter(Boolean)
    };

    el.saveLineup.disabled = true;
    setMessage("Salvando escalação...", false);
    try {
      if (config.backendMode === "cloud") {
        let response = await apiFetch("/api/fantasy/lineups/current", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        let result = await response.json().catch(() => ({}));
        if (!response.ok && lineup.reserve && isBudgetRejection(apiErrorMessage(result, ""))) {
          const fallbackPayload = { ...payload, reserve: null };
          response = await apiFetch("/api/fantasy/lineups/current", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackPayload)
          });
          result = await response.json().catch(() => ({}));
        }
        if (!response.ok) throw new Error(fantasySaveErrorMessage(result, lineup));
      }
      lineup.saved = true;
      if (config.backendMode === "cloud") loadCloudPopular(state.division);
      persistLocalState();
      setMessage(lineupConfirmationMessage(), false, true);
    } catch (error) {
      setMessage(error.message || "Erro ao salvar a escalação.", true);
    } finally {
      renderLineup();
    }
  }

  function lineupConfirmationMessage() {
    const round = state.roundInfo[state.division];
    const roundName = cleanText(round && round.name) || "rodada atual";
    return `Escalação confirmada para ${roundName}\nÚltima atualização: ${formatDateTime(new Date())}.`;
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
    activatePatrimonyForDivision(division);
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

  function setRankingDivision(division) {
    if (!state.lineups[division]) return;
    state.rankingDivision = division;
    updateRankingControls();
    if (config.backendMode === "cloud") loadCloudRanking();
    else renderRanking();
  }

  function setRankingScope(scope) {
    const allowed = new Set(["championship", "round", "overall", "wealth"]);
    state.rankingScope = allowed.has(scope) ? scope : "championship";
    updateRankingControls();
    if (config.backendMode === "cloud") loadCloudRanking();
    else renderRanking();
  }

  function setView(view) {
    state.view = view;
    el.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    el.views.forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
    renderPatrimonyProfile();
    if (view === "market") {
      renderMarketShell();
    } else {
      renderFeedbackAccess();
    }
    if (view === "ranking") {
      updateRankingControls();
      if (config.backendMode === "cloud") loadCloudRanking();
      else renderRanking();
    }
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
    const next = window.prompt("Nome do seu time no Fantasy RK:", state.teamName);
    if (next === null) return;
    const clean = cleanText(next).slice(0, 32);
    if (!clean) return;
    state.teamName = clean;
    currentLineup().saved = false;
    persistLocalState();
    renderLineup();
  }

  async function handleAccountAction() {
    if (!state.userName) {
      startDiscordLogin();
      return;
    }

    if (config.backendMode !== "cloud") {
      resetAuthenticatedState();
      setView("home");
      return;
    }

    el.accountButton.disabled = true;
    el.accountButton.textContent = "Saindo...";
    try {
      const response = await apiFetch("/api/fantasy/auth/logout", {
        method: "POST",
        cache: "no-store"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(apiErrorMessage(payload, "Não foi possível encerrar a sessão no servidor."));
      }
      resetAuthenticatedState();
      setView("home");
      setMessage("Você saiu da sua conta.", false, true);
    } catch (error) {
      setMessage(error.message || "Não foi possível sair agora.", true);
    } finally {
      el.accountButton.disabled = false;
      renderAccount();
    }
  }

  function startDiscordLogin() {
    if (config.backendMode === "cloud") {
      clearAuthToken();
      window.location.href = `${apiBase()}/api/fantasy/auth/login`;
      return;
    }
    el.demoUserName.value = state.userName;
    el.accountDialog.showModal();
  }

  function resetAuthenticatedState() {
    clearAuthToken();
    state.userName = "";
    state.isAdmin = false;
    state.canControlMarket = false;
    state.marketControlBusy = false;
    state.feedbackBusy = false;
    state.teamName = "Meu Time RK";
    state.lineups = { elite: emptyLineup(), ascension: emptyLineup() };
    state.patrimony = { elite: null, ascension: null };
    activatePatrimonyForDivision(state.division);
    try { localStorage.removeItem("fantasy-rk-state-v1"); } catch {}
    renderAccount();
    renderLineup();
    renderMarket();
    renderPatrimonyProfile();
    renderClosedLineups();
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
    el.accountButton.textContent = state.userName ? "Sair" : "Entrar";
    if (el.adminPanelLink) el.adminPanelLink.hidden = !state.isAdmin;
    renderMarketAdminControl();
    renderFeedbackAccess();
  }

  function renderFeedbackAccess() {
    const loggedInMarket = Boolean(state.userName && state.view === "market");
    const marketKnown = config.backendMode !== "cloud" || Boolean(state.roundInfo[state.division]);
    const open = marketKnown && isMarketOpen();
    if (el.marketFeedbackButton) el.marketFeedbackButton.hidden = !loggedInMarket || !open;
    if (el.feedbackHeaderButton) el.feedbackHeaderButton.hidden = !loggedInMarket || !marketKnown || open;
  }

  function openFeedbackDialog() {
    if (!state.userName) return;
    const round = state.roundInfo[state.division];
    const roundNumber = Math.trunc(Number(round?.round_number || round?.roundNumber));
    if (el.feedbackContext) {
      el.feedbackContext.textContent = `${divisionLabel(state.division)}${roundNumber > 0 ? ` · Rodada ${roundNumber}` : ""} · enviado como ${state.userName}`;
    }
    setFeedbackStatus("");
    el.feedbackDialog?.showModal();
    window.setTimeout(() => el.feedbackCategory?.focus(), 0);
  }

  function closeFeedbackDialog() {
    if (el.feedbackDialog?.open) el.feedbackDialog.close();
  }

  async function sendFeedback(event) {
    event.preventDefault();
    if (!state.userName || state.feedbackBusy || !el.feedbackForm?.reportValidity()) return;
    const round = state.roundInfo[state.division];
    const roundNumber = Math.trunc(Number(round?.round_number || round?.roundNumber));
    const body = {
      category: el.feedbackCategory.value,
      subject: cleanText(el.feedbackSubject.value),
      message: cleanText(el.feedbackMessage.value),
      division: state.division,
      roundNumber: roundNumber > 0 ? roundNumber : null,
      pageView: "market"
    };
    state.feedbackBusy = true;
    el.submitFeedback.disabled = true;
    el.submitFeedback.textContent = "Enviando...";
    setFeedbackStatus("Enviando sua mensagem...");
    try {
      const response = await apiFetch("/api/fantasy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Não foi possível enviar sua mensagem."));
      const feedback = payload.feedback || payload.data?.feedback || {};
      el.feedbackForm.reset();
      setFeedbackStatus(`Mensagem enviada com sucesso. Protocolo ${feedback.protocol || "registrado"}. Ela já está disponível no painel da organização.`, false, true);
    } catch (error) {
      setFeedbackStatus(error.message || "Não foi possível enviar sua mensagem.", true);
    } finally {
      state.feedbackBusy = false;
      el.submitFeedback.disabled = false;
      el.submitFeedback.textContent = "Enviar mensagem";
    }
  }

  function setFeedbackStatus(message, isError = false, isSuccess = false) {
    if (!el.feedbackFormStatus) return;
    el.feedbackFormStatus.textContent = message || "";
    el.feedbackFormStatus.classList.toggle("error", Boolean(isError));
    el.feedbackFormStatus.classList.toggle("success", Boolean(isSuccess));
  }

  function renderMarketAdminControl() {
    if (!el.marketAdminControl || !el.marketAdminToggle) return;
    el.marketAdminControl.hidden = !state.canControlMarket;
    if (!state.canControlMarket) return;
    const open = isMarketOpen();
    const anotherDivisionOpen = Object.entries(state.marketOpen).some(([division, value]) => division !== state.division && value);
    const divisionDeadlineReached = !open && anotherDivisionOpen;
    el.marketAdminToggle.disabled = state.marketControlBusy || divisionDeadlineReached;
    el.marketAdminToggle.classList.toggle("open-action", !open);
    el.marketAdminToggle.textContent = state.marketControlBusy
      ? (open ? "Fechando..." : "Abrindo...")
      : divisionDeadlineReached
        ? `${divisionLabel(state.division)} encerrada`
        : (open ? "Fechar mercado" : "Abrir mercado");
  }

  async function toggleMarketFromFantasy() {
    if (!state.canControlMarket || state.marketControlBusy) return;
    const open = isMarketOpen();
    const action = open ? "close" : "open";
    const round = state.roundInfo[state.division];
    const roundNumber = Math.trunc(Number(round?.round_number || round?.roundNumber));
    if (!open && (!Number.isInteger(roundNumber) || roundNumber < 1)) {
      setMarketAdminFeedback("Não foi possível identificar a rodada que deve ser aberta.", true);
      return;
    }
    const confirmed = window.confirm(open
      ? "Fechar o mercado global agora? Novas escalações e alterações serão bloqueadas nas duas divisões."
      : `Abrir o mercado global da rodada ${roundNumber} para Elite e Ascensão?`);
    if (!confirmed) return;

    state.marketControlBusy = true;
    setMarketAdminFeedback("");
    renderMarketAdminControl();
    try {
      const response = await apiFetch(`/api/fantasy/market/control/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(open
          ? { reason: "Fechamento manual pelo controle Discord no Fantasy." }
          : { roundNumber }),
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Não foi possível alterar o mercado."));
      await Promise.all([loadCloudConfig("elite"), loadCloudConfig("ascension")]);
      if (!open) await Promise.all([loadCloudDraftData("elite"), loadCloudDraftData("ascension")]);
      await Promise.all([loadCloudPopular("elite"), loadCloudPopular("ascension")]);
      renderLineup();
      renderMarketShell();
      renderMarket();
      setMarketAdminFeedback(open ? "Mercado fechado nas duas divisões." : "Mercado aberto nas duas divisões.", false, true);
    } catch (error) {
      setMarketAdminFeedback(error.message || "Não foi possível alterar o mercado.", true);
    } finally {
      state.marketControlBusy = false;
      renderMarketAdminControl();
    }
  }

  function setMarketAdminFeedback(message, isError = false, isSuccess = false) {
    if (!el.marketAdminFeedback) return;
    el.marketAdminFeedback.textContent = message || "";
    el.marketAdminFeedback.classList.toggle("error", Boolean(isError));
    el.marketAdminFeedback.classList.toggle("success", Boolean(isSuccess));
  }

  function renderRanking() {
    updateRankingControls();
    renderRankingRows([
      { position: 1, positionChange: 0, teamName: "Barões da Madrugada", division: "elite", manager: "Rickito", roundPoints: 87.4, totalPoints: 241.65, wealthCents: 10240, averagePoints: 80.55, bestRoundPoints: 87.4 },
      { position: 2, positionChange: 1, teamName: "Só Mais Uma MD3", division: "ascension", manager: "Theo", roundPoints: 81.15, totalPoints: 228.2, wealthCents: 10080, averagePoints: 76.07, bestRoundPoints: 84.1 },
      { position: 3, positionChange: -1, teamName: "Gap de Visão", division: "elite", manager: "Melare", roundPoints: 76.9, totalPoints: 219.75, wealthCents: 9940, averagePoints: 73.25, bestRoundPoints: 81.7 },
      { position: 4, positionChange: 0, teamName: "Meu Time RK", division: state.rankingDivision, manager: state.userName || "Você", roundPoints: 0, totalPoints: 0, wealthCents: 10000, averagePoints: 0, bestRoundPoints: 0 }
    ]);
  }

  function renderRankingRows(rows) {
    if (!el.rankingBody) return;
    const showWealth = !rankingUsesAllDivisions();
    el.rankingBody.innerHTML = rows.length ? rows.map((row) => `
      <tr>
        <td>${Number(row.position) || "-"}</td>
        <td>${rankMoveMarkup(row.positionChange)}</td>
        <td>${escapeHtml(row.teamName || "-")}</td>
        <td><span class="division-pill">${escapeHtml(divisionLabel(row.division))}</span></td>
        <td>${escapeHtml(row.manager || "-")}</td>
        <td class="number-cell">${formatNumber(row.roundPoints)}</td>
        <td class="number-cell">${formatNumber(row.totalPoints)}</td>
        ${showWealth ? `<td class="number-cell">RK$ ${formatMoney(Number(row.wealthCents || 0) / 100)}</td>` : ""}
        <td class="number-cell">${formatNumber(row.averagePoints)}</td>
        <td class="number-cell">${formatNumber(row.bestRoundPoints)}</td>
      </tr>
    `).join("") : `<tr><td colspan="${showWealth ? 10 : 9}">O ranking ainda não possui pontuações.</td></tr>`;
  }

  function updateRankingControls() {
    if (el.rankingScope) el.rankingScope.value = state.rankingScope;
    const allDivisions = rankingUsesAllDivisions();
    if (el.rankingWealthHeader) el.rankingWealthHeader.hidden = allDivisions;
    el.rankingDivisionTabs.forEach((button) => {
      button.classList.toggle("active", button.dataset.rankingDivision === state.rankingDivision);
      button.disabled = allDivisions;
    });
    if (el.rankingHelper) {
      if (state.rankingScope === "overall") el.rankingHelper.textContent = "Ranking geral soma os pontos da Elite e da Ascensão por jogador.";
      else if (state.rankingScope === "wealth") el.rankingHelper.textContent = `Maior patrimônio mostra quem tem mais RK$ acumulado na ${divisionLabel(state.rankingDivision)}.`;
      else if (state.rankingScope === "round") el.rankingHelper.textContent = `Ranking da rodada atual da ${divisionLabel(state.rankingDivision)}.`;
      else el.rankingHelper.textContent = `Ranking do campeonato da ${divisionLabel(state.rankingDivision)}.`;
    }
  }

  function rankingUsesAllDivisions() {
    return state.rankingScope === "overall";
  }

  function rankMoveMarkup(value) {
    const change = Number(value) || 0;
    if (change > 0) return `<span class="rank-move up">↑ ${change}</span>`;
    if (change < 0) return `<span class="rank-move down">↓ ${Math.abs(change)}</span>`;
    return `<span class="rank-move">—</span>`;
  }

  async function loadCloudAccount() {
    try {
      const response = await apiFetch("/api/fantasy/me", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      state.userName = response.ok && payload.authenticated && payload.user ? cleanText(payload.user.username) : "";
      const profiles = response.ok && payload.authenticated ? (payload.patrimony || payload.data?.patrimony || {}) : {};
      state.patrimony.elite = profiles.elite || null;
      state.patrimony.ascension = profiles.ascension || null;
      activatePatrimonyForDivision(state.division);
      state.isAdmin = Boolean(response.ok && payload.authenticated && payload.canAccessAdminPanel);
      state.canControlMarket = Boolean(response.ok && payload.authenticated && payload.canControlMarket);
      if (!state.userName && authToken) clearAuthToken();
    } catch (error) {
      state.isAdmin = false;
      state.canControlMarket = false;
      console.warn("Não foi possível consultar a sessão do Fantasy RK.", error);
    }
  }

  async function loadCloudPatrimonyHistory() {
    if (!state.userName || config.backendMode !== "cloud") {
      renderPatrimonyProfile();
      return;
    }
    try {
      const response = await apiFetch("/api/fantasy/history/me", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Histórico patrimonial indisponível."));
      const profiles = payload.profiles || payload.data?.profiles || {};
      state.patrimony.elite = profiles.elite || state.patrimony.elite;
      state.patrimony.ascension = profiles.ascension || state.patrimony.ascension;
      activatePatrimonyForDivision(state.division);
    } catch (error) {
      console.warn("Não foi possível carregar o histórico patrimonial.", error);
    }
    renderPatrimonyProfile();
  }

  function renderPatrimonyProfile() {
    if (!el.patrimonyProfile) return;
    el.patrimonyProfile.hidden = !state.userName || state.view !== "market";
    if (!state.userName || !el.patrimonySummaryBody) return;
    el.patrimonySummaryBody.innerHTML = ["elite", "ascension"].map((division) => {
      const profile = state.patrimony[division] || {
        previousCents: 10000,
        currentCents: 10000,
        roundVariationCents: 0,
        totalVariationCents: 0,
        maximumCents: 10000,
        minimumCents: 10000
      };
      return `
        <div class="patrimony-summary-row" role="row">
          <span role="cell"><span class="division-pill">${escapeHtml(divisionLabel(division))}</span></span>
          <strong role="cell">RK$ ${formatMoney(Number(profile.previousCents) / 100)}</strong>
          <strong role="cell">RK$ ${formatMoney(Number(profile.currentCents) / 100)}</strong>
          <strong role="cell">${signedMoney(Number(profile.roundVariationCents) / 100)}</strong>
          <strong role="cell">${signedMoney(Number(profile.totalVariationCents) / 100)}</strong>
          <strong role="cell">RK$ ${formatMoney(Number(profile.maximumCents) / 100)}</strong>
          <strong role="cell">RK$ ${formatMoney(Number(profile.minimumCents) / 100)}</strong>
        </div>`;
    }).join("");
  }

  function activatePatrimonyForDivision(division) {
    const profile = state.patrimony[division];
    config.budget = Number.isFinite(Number(profile?.currentCents))
      ? roundMoney(Number(profile.currentCents) / 100)
      : 100;
  }

  async function loadCloudLineup(division) {
    if (!state.userName) return;
    try {
      const response = await apiFetch(`/api/fantasy/lineups/current?division=${encodeURIComponent(division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      const patrimony = payload.patrimony || payload.data?.patrimony || null;
      if (patrimony) {
        state.patrimony[division] = patrimony;
        if (division === state.division) activatePatrimonyForDivision(division);
      }
      if (!response.ok) return;
      if (!payload.lineup) {
        state.lineups[division] = emptyLineup();
        persistLocalState();
        return;
      }
      if (payload.team && payload.team.name) state.teamName = cleanText(payload.team.name);
      const lineup = emptyLineup();
      for (const pick of payload.lineup.picks || []) {
        const role = normalizeRole(pick.role);
        const marketItem = state.market[division].find((item) => item.id === String(pick.id));
        if (marketItem && ROLE_ORDER.includes(role)) lineup.slots[role] = savedMarketItem(marketItem, pick, division);
      }
      if (payload.lineup.reserve && payload.lineup.reserve.id) {
        const reserveItem = state.market[division].find((item) => item.id === String(payload.lineup.reserve.id));
        if (reserveItem && reserveItem.type === "player") lineup.reserve = savedMarketItem(reserveItem, payload.lineup.reserve, division);
      }
      for (const prediction of payload.lineup.draftPredictions || []) {
        const role = normalizeRole(prediction.role);
        const player = lineup.slots[role];
        if (!player || player.id !== String(prediction.playerAssetId)) continue;
        lineup.draftPredictions[role] = {
          playerAssetId: String(prediction.playerAssetId),
          role,
          mode: cleanText(prediction.mode).toUpperCase() || "NONE",
          championId: prediction.championId || null,
          mapNumber: prediction.mapNumber == null ? null : Number(prediction.mapNumber),
          pickRatePosition: prediction.pickRatePosition || role,
          pickRateAtLock: prediction.pickRateAtLock == null ? null : Number(prediction.pickRateAtLock),
          multiplierAtLock: prediction.multiplierAtLock == null ? null : Number(prediction.multiplierAtLock),
          baseReward: Number(prediction.baseReward) || 0,
          possibleReward: Number(prediction.possibleReward) || 0,
          missPenalty: Number(prediction.missPenalty) || 0,
          status: prediction.status || "NONE",
          resultScore: prediction.resultScore == null ? null : Number(prediction.resultScore)
        };
      }
      lineup.captainId = cleanText(payload.lineup.captain_asset_id || payload.lineup.captainId);
      lineup.saved = true;
      state.lineups[division] = lineup;
    } catch (error) {
      console.warn(`Não foi possível carregar a escalação ${division}.`, error);
    }
  }

  function savedMarketItem(marketItem, pick, division = state.division) {
    const priceSource = state.marketOpen[division] ? marketItem.price : (pick && pick.price);
    return {
      ...marketItem,
      purchasePrice: Number.isFinite(Number(priceSource)) ? roundMoney(priceSource) : roundMoney(marketItem.price)
    };
  }

  function syncAllLineupsWithMarket(options = {}) {
    Object.keys(state.lineups).forEach((division) => syncLineupWithMarket(division, options));
  }

  function syncLineupWithMarket(division, options = {}) {
    const lineup = state.lineups[division];
    const market = state.market[division] || [];
    if (!lineup || !market.length) return false;

    let changed = false;
    const forceCurrentPrices = Boolean(options.forceCurrentPrices);
    const useCurrentPrices = forceCurrentPrices || Boolean(state.marketOpen[division]);

    const syncItem = (item) => {
      if (!item || !item.id) return item;
      const marketItem = market.find((candidate) => candidate.id === String(item.id));
      if (!marketItem) return item;
      const purchaseSource = useCurrentPrices ? marketItem.price : itemPurchasePrice(item);
      const purchasePrice = Number.isFinite(Number(purchaseSource)) ? roundMoney(purchaseSource) : roundMoney(marketItem.price);
      const synced = { ...marketItem, purchasePrice };
      if (
        item.price !== synced.price ||
        item.purchasePrice !== synced.purchasePrice ||
        item.name !== synced.name ||
        item.teamTag !== synced.teamTag ||
        item.teamSlot !== synced.teamSlot
      ) {
        changed = true;
      }
      return synced;
    };

    for (const role of ROLE_ORDER) {
      lineup.slots[role] = syncItem(lineup.slots[role]);
    }
    lineup.reserve = syncItem(lineup.reserve);

    if (lineup.captainId && !Object.values(lineup.slots).some((item) => item && item.id === lineup.captainId)) {
      lineup.captainId = "";
      changed = true;
    }

    if (changed) persistLocalState();
    return changed;
  }

  async function loadCloudConfig(division) {
    try {
      const response = await apiFetch(`/api/fantasy/config?division=${encodeURIComponent(division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      const rules = payload.rules || payload.data?.rules || {};
      const patrimony = payload.patrimony || payload.data?.patrimony || null;
      if (division === state.division && Number.isFinite(Number(rules.budget))) {
        config.budget = roundMoney(rules.budget);
      }
      if (patrimony) {
        state.patrimony[division] = patrimony;
        if (division === state.division) activatePatrimonyForDivision(division);
      }
      const round = normalizeRoundInfo(payload.round);
      if (!response.ok || !round) return;
      const market = payload.market || payload.data?.market || null;
      state.marketAccessMode[division] = market?.accessMode === "admin" ? "admin" : "public";
      const open = market
        ? market.status === "open" && Date.now() < Date.parse(market.closesAt)
        : round.status === "open" && Date.now() < Date.parse(round.locks_at);
      state.roundInfo[division] = round;
      state.marketOpen[division] = open;
      renderPatrimonyProfile();
      if (division === state.division) {
        updateMarketStatus();
        renderLineup();
        renderMarketShell();
        renderPopularPicks();
      }
      if (!open && config.backendMode === "cloud") loadCloudClosedRanking(division);
    } catch (error) {
      console.warn("Não foi possível carregar o status da rodada.", error);
    }
  }

  function normalizeRoundInfo(round) {
    if (!round) return null;
    const name = cleanText(round.name);
    const roundNumber = Number(round.round_number || round.roundNumber || round.number || 1);
    return {
      ...round,
      name: name || `Rodada ${roundNumber || ""}`.trim()
    };
  }

  async function loadCloudPopular(division) {
    if (config.backendMode !== "cloud") {
      state.popular[division] = [];
      state.popularRound[division] = null;
      renderPopularPicks();
      return;
    }
    try {
      const response = await apiFetch(`/api/fantasy/popular?division=${encodeURIComponent(division)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Mais escalados indisponíveis."));
      state.popularRound[division] = payload.round || null;
      state.popular[division] = (payload.popular || []).map((item) => {
        const marketItem = state.market[division].find((asset) => asset.id === String(item.id));
        return marketItem ? { ...marketItem, picks: normalizePickCount(item.picks) } : marketLikeItem(item);
      });
      state.popularHighlights[division] = Object.fromEntries(Object.entries(payload.highlights || {}).map(([key, item]) => {
        const marketItem = item && state.market[division].find((asset) => asset.id === String(item.id));
        return [key, marketItem ? { ...marketItem, picks: normalizePickCount(item.picks) } : (item ? marketLikeItem(item) : null)];
      }));
      if (!state.popularHighlights[division].team && payload.team) state.popularHighlights[division].team = marketLikeItem(payload.team);
    } catch (error) {
      console.warn("Não foi possível carregar os mais escalados.", error);
      state.popular[division] = [];
      state.popularHighlights[division] = {};
    }
    if (division === state.division) {
      renderPopularPicks();
      renderClosedHighlights();
    }
  }

  function marketLikeItem(item) {
    return {
      id: String(item.id),
      type: item.type === "team" || normalizeRole(item.role) === "TEAM" ? "team" : "player",
      role: normalizeRole(item.role),
      name: cleanText(item.name),
      teamName: cleanText(item.teamName),
      teamTag: cleanText(item.teamTag).toUpperCase(),
      teamSlot: cleanText(item.teamSlot),
      logo: normalizeAssetPath(item.logo),
      price: roundMoney(item.price),
      previousPrice: Number.isFinite(Number(item.previousPrice)) ? roundMoney(item.previousPrice) : roundMoney(item.price),
      priceDelta: roundMoney(Number(item.price) - Number(Number.isFinite(Number(item.previousPrice)) ? item.previousPrice : item.price)),
      average: roundMoney(item.average),
      recentPoints: normalizeRecentPoints(item.recentPoints),
      maintenanceScore: Number.isFinite(Number(item.maintenanceScore))
        ? roundMoney(item.maintenanceScore)
        : null,
      picks: normalizePickCount(item.picks)
    };
  }

  function normalizePickCount(value) {
    return Math.max(0, Math.trunc(Number(value) || 0));
  }

  async function loadCloudClosedRanking(division) {
    try {
      const response = await apiFetch(`/api/fantasy/ranking?division=${encodeURIComponent(division)}&scope=championship`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Ranking indisponível."));
      state.closedRanking[division] = payload.ranking || [];
    } catch (error) {
      console.warn("Não foi possível carregar o ranking do mercado fechado.", error);
      state.closedRanking[division] = [];
    }
    if (division === state.division) renderClosedRanking();
  }

  async function loadCloudRanking() {
    try {
      updateRankingControls();
      const division = rankingUsesAllDivisions() ? "all" : state.rankingDivision;
      const scope = state.rankingScope || "championship";
      const response = await apiFetch(`/api/fantasy/ranking?division=${encodeURIComponent(division)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Ranking indisponível."));
      const rows = payload.ranking || [];
      renderRankingRows(rows);
    } catch (error) {
      console.warn("Não foi possível carregar o ranking online.", error);
      if (el.rankingBody) el.rankingBody.innerHTML = `<tr><td colspan="${rankingUsesAllDivisions() ? 9 : 10}">Não foi possível carregar o ranking agora.</td></tr>`;
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

    const cleanUrl = new URL(location.href);
    cleanUrl.hash = "";
    cleanUrl.searchParams.delete("view");
    history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}`);
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
      initialViewAfterLogin = "market";
      setView("market");
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

  function isBudgetRejection(message) {
    return /or[cç]amento|budget|ultrapassa/i.test(String(message || ""));
  }

  function fantasySaveErrorMessage(payload, lineup) {
    const message = apiErrorMessage(payload, "Não foi possível salvar a escalação.");
    if (!isBudgetRejection(message)) return message;
    const localCost = formatMoney(lineupStarterPurchaseCost(lineup));
    return `Sua escalação está em RK$ ${localCost} após a atualização dos preços. Troque uma ou mais escolhas para ficar dentro do limite de RK$ ${formatMoney(config.budget)} e tente salvar novamente.`;
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
    for (const role of PLAYER_ROLES) {
      const prediction = value?.draftPredictions?.[role];
      if (prediction && prediction.playerAssetId) lineup.draftPredictions[role] = prediction;
    }
    lineup.captainId = cleanText(value && value.captainId);
    lineup.saved = Boolean(value && value.saved);
    return lineup;
  }

  function reconcileLineupsWithMarket() {
    for (const division of ["elite", "ascension"]) {
      const market = new Map((state.market[division] || []).map((item) => [item.id, item]));
      const lineup = state.lineups[division];
      if (!lineup) continue;
      for (const role of ROLE_ORDER) {
        const picked = lineup.slots[role];
        if (picked && market.has(picked.id)) lineup.slots[role] = market.get(picked.id);
      }
      if (lineup.reserve && market.has(lineup.reserve.id)) lineup.reserve = market.get(lineup.reserve.id);
    }
  }

  function emptyLineup() {
    return { slots: Object.fromEntries(ROLE_ORDER.map((role) => [role, null])), reserve: null, draftPredictions: {}, captainId: "", saved: false };
  }

  function currentLineup() {
    return state.lineups[state.division];
  }

  function isMarketOpen(division = state.division) {
    return state.marketOpen[division] !== false;
  }

  function updateMarketStatus() {
    if (!el.marketStatus || !el.marketDeadline) return;
    const round = state.roundInfo[state.division];
    const now = Date.now();
    const opensAt = Date.parse(round?.opens_at);
    const locksAt = Date.parse(round?.locks_at);
    const open = Boolean(round && round.status === "open" && Number.isFinite(locksAt) && now < locksAt && (!Number.isFinite(opensAt) || now >= opensAt));
    const administrative = open && state.marketAccessMode[state.division] === "admin" && state.canControlMarket;
    if (round) state.marketOpen[state.division] = open;
    el.marketStatus.textContent = open ? (administrative ? "MERCADO ADMINISTRATIVO" : "MERCADO ABERTO") : "MERCADO FECHADO";
    el.marketStatus.style.color = open ? "var(--success)" : "var(--danger)";
    if (open) {
      el.marketDeadline.textContent = administrative
        ? `Acesso exclusivo da administração · fecha em ${formatCountdown(locksAt - now)}`
        : `Mercado fecha em ${formatCountdown(locksAt - now)}`;
      return;
    }
    if (round?.status === "scheduled" && Number.isFinite(opensAt) && opensAt > now) {
      el.marketDeadline.textContent = `Mercado abre em ${formatCountdown(opensAt - now)}`;
      return;
    }
    el.marketDeadline.textContent = round?.name ? `${round.name} · mercado fechado` : "Aguardando rodada.";
  }

  function formatCountdown(milliseconds) {
    const totalMinutes = Math.max(0, Math.ceil(Number(milliseconds || 0) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days > 0) parts.push(`${String(days).padStart(2, "0")}d`);
    parts.push(`${String(hours).padStart(2, "0")}h`);
    parts.push(`${String(minutes).padStart(2, "0")}min`);
    return parts.join(" ");
  }

  function closedMarketDetail(round) {
    const locksAt = Date.parse(round?.locks_at);
    if (Number.isFinite(locksAt) && locksAt <= Date.now()) {
      return `O prazo da ${divisionLabel(state.division)} terminou em ${new Date(locksAt).toLocaleString("pt-BR")}.`;
    }
    if (state.marketAccessMode[state.division] === "admin") {
      return "Mercado temporariamente disponível apenas para a administração.";
    }
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

  function itemPurchasePrice(item) {
    return roundMoney(Number(item && item.purchasePrice != null ? item.purchasePrice : item && item.price) || 0);
  }

  function lineupPurchaseCost(lineup) {
    const starters = Object.values(lineup.slots).reduce((total, item) => total + (item ? itemPurchasePrice(item) : 0), 0);
    return roundMoney(starters + (lineup.reserve ? itemPurchasePrice(lineup.reserve) : 0));
  }

  function lineupCurrentValue(lineup) {
    const starters = Object.values(lineup.slots).reduce((total, item) => total + (item ? Number(item.price) : 0), 0);
    return roundMoney(starters + (lineup.reserve ? Number(lineup.reserve.price) : 0));
  }

  function lineupStarterPurchaseCost(lineup) {
    return roundMoney(Object.values(lineup.slots).reduce((total, item) => total + (item ? itemPurchasePrice(item) : 0), 0));
  }

  function lineupCash(lineup) {
    return roundMoney(config.budget - lineupCurrentValue(lineup));
  }

  function lineupPatrimony(_lineup) {
    return roundMoney(config.budget);
  }

  function starterPlayers(lineup) {
    return PLAYER_ROLES.map((role) => lineup.slots[role]).filter(Boolean);
  }

  function reserveBudget(lineup) {
    const remainingBudget = lineupCash({ ...lineup, reserve: null });
    return roundMoney(Math.max(0, remainingBudget));
  }

  function reserveValidationMessage(item, lineup) {
    if (!item || item.type !== "player" || item.role === "TEAM") return "A reserva precisa ser um jogador, não uma equipe.";
    if (Object.values(lineup.slots).some((picked) => picked && picked.id === item.id)) return "Esse jogador já está como titular. O reserva precisa ser outro jogador.";
    if (Object.values(lineup.slots).filter(Boolean).length !== 6) return "Complete os seis titulares antes de escolher o reserva.";
    const budget = reserveBudget(lineup);
    if (Number(item.price) > budget + 0.001) return `Esse reserva custa RK$ ${formatMoney(item.price)}, mas seu limite para reserva é RK$ ${formatMoney(budget)}.`;
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
    const isPlayer = item && item.type === "player";
    const artwork = isPlayer ? "" : itemArtworkPath(item);
    const source = isPlayer ? item.logo : (artwork || item.logo);
    if (source) {
      const img = document.createElement("img");
      img.className = "player-logo";
      img.src = source;
      img.alt = `Logo ${item.teamName || item.teamTag || item.name}`;
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
    if (item && item.artwork) return item.artwork;
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

  function officialSiteUrl() {
    return cleanText(config.siteUrl) || "https://liga-rk.github.io/liga-rk-26-2/fantasy/";
  }

  function officialSiteLabel() {
    return officialSiteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  function shareLineupText() {
    return `Minha escalação no Fantasy RK da Liga RK! ${officialSiteUrl()}`;
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

    if (canSharePreparedFile()) {
      try {
        await navigator.share({
          title: `${state.teamName} — Fantasy RK`,
          text: shareLineupText(),
          files: [preparedShare.file]
        });
        setShareMessage("Imagem enviada para o compartilhamento. Escolha o WhatsApp na lista do aparelho.", false, true);
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
    if (whatsappWindow) whatsappWindow.location.href = `https://web.whatsapp.com/send?text=${encodeURIComponent(shareLineupText())}`;
    setShareMessage(
      copied
        ? "Imagem copiada e WhatsApp aberto com o link oficial. Escolha uma conversa e pressione Ctrl+V para colar o PNG."
        : "Imagem baixada e WhatsApp aberto com o link oficial. Anexe o PNG salvo na conversa.",
      false,
      true
    );
  }

  async function sharePreparedWithSystem() {
    if (!canSharePreparedFile()) return;
    try {
      await navigator.share({
        title: `${state.teamName} — Fantasy RK`,
        text: shareLineupText(),
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

    const spent = lineupCurrentValue(lineup);
    const finance = [
      ["PATRIMÔNIO", lineupPatrimony(lineup)],
      ["UTILIZADO", spent],
      ["DISPONÍVEL", lineupCash(lineup)]
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
      ctx.fillText(formatMoney(value), x + 70, 407);
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
        ctx.fillText(`RK$ ${formatMoney(item.price)}`, x + 198, y + 181);
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
      ctx.fillText(`RK$ ${formatMoney(item.price)} · só entra se titular não jogar`, x + 650, y + 55);
    }

    ctx.fillStyle = "#9c9497";
    ctx.font = "18px Inter, Arial, sans-serif";
    ctx.fillText(`Escale seu time no Fantasy RK · ${officialSiteLabel()}`, 60, 1452);
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
    const sources = item && item.type === "player"
      ? [item.logo].filter(Boolean)
      : [itemArtworkPath(item), item && item.logo].filter(Boolean);
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
    const availability = (a, b) => Number(a.selectable === false) - Number(b.selectable === false);
    if (sort === "price-asc") return (a, b) => availability(a, b) || a.price - b.price || a.name.localeCompare(b.name, "pt-BR");
    if (sort === "name") return (a, b) => availability(a, b) || a.name.localeCompare(b.name, "pt-BR");
    if (sort === "avg-desc") return (a, b) => availability(a, b) || b.average - a.average || b.price - a.price;
    return (a, b) => availability(a, b) || b.price - a.price || a.name.localeCompare(b.name, "pt-BR");
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

  function normalizeRecentPoints(value) {
    return Array.isArray(value)
      ? value.map((point) => roundMoney(point)).filter((point) => Number.isFinite(point)).slice(0, 3)
      : [];
  }

  function demoRecentPoints(seed) {
    return [roundMoney(8 + ((stableNumber(`${seed}:latest`) % 1200) / 100))];
  }

  function formatNumber(value) {
    const number = Number(value || 0);
    const integer = Number.isInteger(number);
    return number.toLocaleString("pt-BR", { minimumFractionDigits: integer ? 0 : 2, maximumFractionDigits: integer ? 0 : 2 });
  }

  function formatMoney(value) {
    const number = Number(value || 0);
    return number.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function signedNumber(value) {
    const number = Number(value || 0);
    return `${number > 0 ? "+" : ""}${formatNumber(number)}`;
  }

  function signedMoney(value) {
    const number = Number(value || 0);
    if (number < 0) return `-RK$ ${formatMoney(Math.abs(number))}`;
    return `${number > 0 ? "+" : ""}RK$ ${formatMoney(number)}`;
  }

  function objectValue(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function formatDateTime(value) {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).replace(",", " às");
  }

  function divisionLabel(value) {
    if (value === "all") return "Geral";
    return value === "ascension" ? "Divisão Ascensão" : "Divisão Elite";
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
