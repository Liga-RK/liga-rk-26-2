const POSITION_MAP = Object.freeze({
  TOP: "TOP",
  JUNGLE: "JG",
  MIDDLE: "MID",
  MID: "MID",
  BOTTOM: "ADC",
  BOT: "ADC",
  UTILITY: "SUP",
  SUPPORT: "SUP",
  SUP: "SUP"
});

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanWin(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "win" || normalized === "true" || normalized === "1";
}

function normalizePosition(value) {
  return POSITION_MAP[String(value || "").trim().toUpperCase()] || "";
}

function normalizeRiotId(gameName, tagLine) {
  const name = String(gameName || "").trim();
  const tag = String(tagLine || "").trim();
  return name && tag ? `${name}#${tag}` : name;
}

function normalizeParticipant(raw, index) {
  const team = numberValue(raw.TEAM);
  const gameName = String(raw.RIOT_ID_GAME_NAME || raw.NAME || "").trim();
  const tagLine = String(raw.RIOT_ID_TAG_LINE || "").trim();
  const objectives = {
    towers: numberValue(raw.TURRETS_KILLED),
    voidGrubs: numberValue(raw.HORDE_KILLS),
    heralds: numberValue(raw.RIFT_HERALD_KILLS),
    dragons: numberValue(raw.DRAGON_KILLS),
    elderDragons: numberValue(raw.ELDER_DRAGON_KILLS),
    barons: numberValue(raw.BARON_KILLS)
  };

  return {
    participantIndex: index,
    riotId: normalizeRiotId(gameName, tagLine),
    gameName,
    tagLine,
    team,
    side: team === 100 ? "blue" : team === 200 ? "red" : "",
    position: normalizePosition(raw.TEAM_POSITION || raw.INDIVIDUAL_POSITION),
    champion: String(raw.SKIN || "").trim(),
    won: booleanWin(raw.WIN),
    kills: numberValue(raw.CHAMPIONS_KILLED),
    deaths: numberValue(raw.NUM_DEATHS),
    assists: numberValue(raw.ASSISTS),
    gold: numberValue(raw.GOLD_EARNED),
    damageToChampions: numberValue(raw.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS),
    visionScore: numberValue(raw.VISION_SCORE),
    wardsPlaced: numberValue(raw.WARD_PLACED),
    wardsKilled: numberValue(raw.WARD_KILLED),
    towers: objectives.towers,
    voidGrubs: objectives.voidGrubs,
    heralds: objectives.heralds,
    dragons: objectives.dragons,
    elderDragons: objectives.elderDragons,
    barons: objectives.barons,
    objectives,
    items: Array.from({ length: 7 }, (_, itemIndex) => numberValue(raw[`ITEM${itemIndex}`]))
  };
}

function sum(participants, key) {
  return participants.reduce((total, participant) => total + numberValue(participant[key]), 0);
}

function buildTeam(team, participants) {
  const teamParticipants = participants.filter((participant) => participant.team === team);
  return {
    team,
    side: team === 100 ? "blue" : "red",
    won: teamParticipants.some((participant) => participant.won),
    kills: sum(teamParticipants, "kills"),
    deaths: sum(teamParticipants, "deaths"),
    assists: sum(teamParticipants, "assists"),
    gold: sum(teamParticipants, "gold"),
    damageToChampions: sum(teamParticipants, "damageToChampions"),
    visionScore: sum(teamParticipants, "visionScore"),
    wardsPlaced: sum(teamParticipants, "wardsPlaced"),
    wardsKilled: sum(teamParticipants, "wardsKilled"),
    towers: sum(teamParticipants, "towers"),
    voidGrubs: sum(teamParticipants, "voidGrubs"),
    heralds: sum(teamParticipants, "heralds"),
    dragons: sum(teamParticipants, "dragons"),
    elderDragons: sum(teamParticipants, "elderDragons"),
    barons: sum(teamParticipants, "barons")
  };
}

function formatDuration(milliseconds) {
  const safe = Math.max(0, Math.round(numberValue(milliseconds)));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

module.exports = {
  buildTeam,
  formatDuration,
  normalizeParticipant,
  normalizePosition,
  normalizeRiotId,
  numberValue
};
