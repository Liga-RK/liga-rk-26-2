(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LIGA_RK_GROUP_STANDINGS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GROUPS = ["A", "B", "C", "D"];

  function compute(options = {}) {
    const rounds = Array.isArray(options.rounds) ? options.rounds : [];
    const resolveResult = typeof options.resolveResult === "function" ? options.resolveResult : () => ({});
    const resolveTeam = typeof options.resolveTeam === "function" ? options.resolveTeam : (slot) => ({ slot });
    const standings = Object.fromEntries(GROUPS.map((group) => [group, [1, 2, 3, 4].map((seed, index) => {
      const slot = `${group}${seed}`;
      return {
        slot,
        seed: index,
        team: resolveTeam(slot) || { slot },
        wins: 0,
        losses: 0,
        gameDiff: 0,
        games: 0
      };
    })]));
    const entries = Object.fromEntries(Object.values(standings).flat().map((entry) => [entry.slot, entry]));

    rounds.forEach((round, roundIndex) => {
      (round.games || []).forEach((game, gameIndex) => {
        const normalized = normalizeGame(game);
        const result = resolveResult(roundIndex, gameIndex, normalized) || {};
        applySeries(entries[normalized.home], entries[normalized.away], result.homeScore, result.awayScore);
      });
    });

    Object.values(standings).forEach((entriesInGroup) => entriesInGroup.sort(compareEntries));
    return standings;
  }

  function applySeries(home, away, rawHomeScore, rawAwayScore) {
    if (!home || !away) return false;
    const homeScore = parseScore(rawHomeScore);
    const awayScore = parseScore(rawAwayScore);
    if (homeScore === null || awayScore === null) return false;

    home.gameDiff += homeScore - awayScore;
    away.gameDiff += awayScore - homeScore;

    if (!isCompletedSeries(homeScore, awayScore)) return false;

    home.games += 1;
    away.games += 1;

    if (homeScore === 2) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
    return true;
  }

  function compareEntries(a, b) {
    return (
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.gameDiff - a.gameDiff ||
      timeToSeconds(a.team && a.team.avgWinTime) - timeToSeconds(b.team && b.team.avgWinTime) ||
      a.seed - b.seed
    );
  }

  function parseScore(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const score = Number(text);
    return Number.isInteger(score) && score >= 0 && score <= 2 ? score : null;
  }

  function isCompletedSeries(homeScore, awayScore) {
    if (homeScore === null || awayScore === null || homeScore === awayScore) return false;
    return (homeScore === 2 && awayScore < 2) || (awayScore === 2 && homeScore < 2);
  }

  function normalizeGame(game) {
    return Array.isArray(game) ? { time: game[0], home: game[1], away: game[2] } : (game || {});
  }

  function timeToSeconds(value) {
    const match = /^(\d{1,3}):([0-5]\d)$/.exec(String(value || "99:59").trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  return { applySeries, compareEntries, compute, isCompletedSeries, normalizeGame, parseScore, timeToSeconds };
});
