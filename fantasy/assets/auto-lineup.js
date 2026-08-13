(function exposeAutoLineup(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FANTASY_AUTO_LINEUP = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAutoLineupModule() {
  "use strict";

  const ROLE_ORDER = ["TOP", "JG", "MID", "ADC", "SUP", "TEAM"];
  const PLAYER_ROLES = ROLE_ORDER.filter((role) => role !== "TEAM");
  const VALID_STRATEGIES = new Set([
    "balanced",
    "average",
    "recent",
    "appreciation",
    "value",
    "economic",
    "random"
  ]);
  const MAX_BEAM_STATES = 6000;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function toCents(value) {
    return Math.max(0, Math.round(finite(value) * 100));
  }

  function recentForm(item) {
    const points = Array.isArray(item?.recentPoints)
      ? item.recentPoints.map((value) => finite(value, NaN)).filter(Number.isFinite).slice(0, 3)
      : [];
    if (!points.length) return null;
    const weights = [5, 3, 2].slice(0, points.length);
    const weightTotal = weights.reduce((total, value) => total + value, 0);
    return points.reduce((total, value, index) => total + value * weights[index], 0) / weightTotal;
  }

  function scoreItem(item, strategy = "balanced", random = Math.random) {
    const normalizedStrategy = VALID_STRATEGIES.has(strategy) ? strategy : "balanced";
    const average = finite(item?.average);
    const recent = recentForm(item);
    const hasRecent = recent !== null;
    const currentForm = hasRecent ? recent : average * 0.42;
    const price = Math.max(0.01, finite(item?.price, 0.01));
    const appreciation = finite(item?.priceDelta);
    const efficiency = ((average * 0.58) + (currentForm * 0.42)) / price;

    if (normalizedStrategy === "average") return average;
    if (normalizedStrategy === "recent") return hasRecent ? currentForm + average * 0.08 : -500 + average * 0.08;
    if (normalizedStrategy === "appreciation") return appreciation * 18 + currentForm * 0.28 + average * 0.12;
    if (normalizedStrategy === "value") return efficiency * 12 - price * 0.04;
    if (normalizedStrategy === "economic") return -price * 100 + average * 0.03 + currentForm * 0.02;
    if (normalizedStrategy === "random") return finite(random(), 0.5) * 100;
    return average * 0.42 + currentForm * 0.3 + efficiency * 4.5 + appreciation * 4;
  }

  function captainScore(item) {
    const average = finite(item?.average);
    const recent = recentForm(item);
    return average * 0.58 + (recent === null ? average : recent) * 0.42;
  }

  function teamKey(item) {
    return String(item?.teamSlot || item?.teamTag || item?.teamName || "");
  }

  function scoredCandidates(market, role, strategy, random) {
    return market
      .filter((item) => item && item.selectable !== false && String(item.role).toUpperCase() === role)
      .map((item) => ({ item, score: scoreItem(item, strategy, random), priceCents: toCents(item.price) }))
      .sort((left, right) => right.score - left.score || left.priceCents - right.priceCents || String(left.item.name).localeCompare(String(right.item.name), "pt-BR"));
  }

  function pruneStates(states) {
    const best = states.slice().sort((left, right) => right.score - left.score || left.costCents - right.costCents).slice(0, 4200);
    const economical = states.slice().sort((left, right) => left.costCents - right.costCents || right.score - left.score).slice(0, 1200);
    const efficient = states.slice().sort((left, right) => {
      const leftRatio = left.score / Math.max(1, left.costCents);
      const rightRatio = right.score / Math.max(1, right.costCents);
      return rightRatio - leftRatio || right.score - left.score;
    }).slice(0, 600);
    const unique = new Map();
    for (const state of [...best, ...economical, ...efficient]) {
      const key = state.ids.join("|");
      if (!unique.has(key)) unique.set(key, state);
      if (unique.size >= MAX_BEAM_STATES) break;
    }
    return Array.from(unique.values());
  }

  function buildAutomaticLineup(options = {}) {
    const market = Array.isArray(options.market) ? options.market : [];
    const budgetCents = toCents(options.budget);
    const maxPlayersPerTeam = Math.max(1, Math.trunc(finite(options.maxPlayersPerTeam, 2)));
    const strategy = VALID_STRATEGIES.has(options.strategy) ? options.strategy : "balanced";
    const random = typeof options.random === "function" ? options.random : Math.random;
    const includeReserve = options.includeReserve !== false;
    const candidatesByRole = Object.fromEntries(
      ROLE_ORDER.map((role) => [role, scoredCandidates(market, role, strategy, random)])
    );

    const missingRoles = ROLE_ORDER.filter((role) => !candidatesByRole[role].length);
    if (missingRoles.length) {
      return { ok: false, error: `Não há opções disponíveis para: ${missingRoles.join(", ")}.` };
    }

    const minimumFutureCost = ROLE_ORDER.map((_, index) => ROLE_ORDER
      .slice(index + 1)
      .reduce((total, role) => total + Math.min(...candidatesByRole[role].map((candidate) => candidate.priceCents)), 0));
    let states = [{ items: [], ids: [], costCents: 0, score: 0, playerTeamCounts: {} }];

    ROLE_ORDER.forEach((role, roleIndex) => {
      const nextStates = [];
      for (const state of states) {
        for (const candidate of candidatesByRole[role]) {
          const nextCost = state.costCents + candidate.priceCents;
          if (nextCost + minimumFutureCost[roleIndex] > budgetCents) continue;
          const key = teamKey(candidate.item);
          const isPlayer = role !== "TEAM" && candidate.item.type !== "team";
          const teamCount = isPlayer ? finite(state.playerTeamCounts[key]) : 0;
          if (isPlayer && key && teamCount >= maxPlayersPerTeam) continue;
          const playerTeamCounts = { ...state.playerTeamCounts };
          if (isPlayer && key) playerTeamCounts[key] = teamCount + 1;
          nextStates.push({
            items: [...state.items, candidate.item],
            ids: [...state.ids, String(candidate.item.id)],
            costCents: nextCost,
            score: state.score + candidate.score,
            playerTeamCounts
          });
        }
      }
      states = pruneStates(nextStates);
    });

    if (!states.length) {
      return { ok: false, error: "Não foi possível montar seis titulares dentro do seu patrimônio e das regras por equipe." };
    }

    states.sort((left, right) => right.score - left.score || left.costCents - right.costCents);
    const selected = states[0];
    const slots = Object.fromEntries(ROLE_ORDER.map((role, index) => [role, selected.items[index]]));
    const selectedIds = new Set(selected.ids);
    let reserve = null;

    if (includeReserve) {
      const remainingCents = budgetCents - selected.costCents;
      const reserveCandidates = market
        .filter((item) => item && item.selectable !== false && item.type !== "team" && PLAYER_ROLES.includes(String(item.role).toUpperCase()))
        .filter((item) => !selectedIds.has(String(item.id)) && toCents(item.price) <= remainingCents)
        .filter((item) => {
          const key = teamKey(item);
          return !key || finite(selected.playerTeamCounts[key]) < maxPlayersPerTeam;
        })
        .map((item) => ({ item, score: scoreItem(item, strategy, random), priceCents: toCents(item.price) }));
      reserveCandidates.sort(strategy === "economic"
        ? (left, right) => left.priceCents - right.priceCents || right.score - left.score
        : (left, right) => right.score - left.score || left.priceCents - right.priceCents);
      reserve = reserveCandidates[0]?.item || null;
    }

    const captain = PLAYER_ROLES
      .map((role) => slots[role])
      .sort((left, right) => captainScore(right) - captainScore(left))[0];
    const totalCostCents = selected.costCents + (reserve ? toCents(reserve.price) : 0);
    return {
      ok: true,
      strategy,
      slots,
      reserve,
      captainId: String(captain?.id || ""),
      starterCost: selected.costCents / 100,
      totalCost: totalCostCents / 100,
      remaining: (budgetCents - totalCostCents) / 100
    };
  }

  return { ROLE_ORDER, PLAYER_ROLES, VALID_STRATEGIES, recentForm, scoreItem, buildAutomaticLineup };
});
