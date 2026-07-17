function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function divide(value, divisor) {
  return divisor > 0 ? finite(value) / divisor : 0;
}

function kda(kills, deaths, assists) {
  const numerator = finite(kills) + finite(assists);
  return finite(deaths) > 0 ? numerator / finite(deaths) : numerator;
}

function participation(kills, assists, teamKills) {
  return divide(finite(kills) + finite(assists), finite(teamKills));
}

function damageShare(damage, teamDamage) {
  return divide(damage, teamDamage);
}

function perMinute(value, durationSeconds) {
  return divide(value, finite(durationSeconds) / 60);
}

function winRate(wins, games) {
  return divide(wins, games);
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((finite(value) + Number.EPSILON) * factor) / factor;
}

module.exports = { damageShare, finite, kda, participation, perMinute, round, winRate };
