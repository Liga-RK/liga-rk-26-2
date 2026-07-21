(function () {
  const fixedData = window.LIGA_RK_DATA;
  const contentData = window.LIGA_RK_CONTENT || {};
  const replayStatsData = window.LIGA_RK_STATS || {};
  const groupStandings = window.LIGA_RK_GROUP_STANDINGS;
  const divisionKey = document.body.dataset.division;
  const division = fixedData && fixedData[divisionKey];
  const contentApiUrl = window.LIGA_RK_CONTENT_API || "https://liga-rk-api.suporteinhouserk.workers.dev/api/content";
  let contentSource = contentData;
  let content = (contentSource.divisions && contentSource.divisions[divisionKey]) || {};
  const replayStats = (replayStatsData.divisions && replayStatsData.divisions[divisionKey]) || {};
  const app = document.getElementById("app");

  if (!app || !division) {
    return;
  }

  const groupLetters = ["A", "B", "C", "D"];
  const laneOrder = ["TOP", "JG", "MID", "ADC", "SUP", "SUB", "SUB", "SUB"];
  const slotOrder = groupLetters.flatMap((group) => [1, 2, 3, 4].map((seed) => `${group}${seed}`));
  const assetVersion = "20260618";
  const rulesPdfUrl = `assets/docs/regulamento-liga-rk-26-2.pdf?v=${assetVersion}`;
  const rkPlaceholderUrl = "assets/logo_rk_placeholder.png";
  const publicSectionLocks = {
    playoffs: "Disponibilizado após o final da fase de grupos grupos.",
    vods: "Disponibilizado após o início das rodadas.",
    statistics: "Disponibilizado após o início das rodadas."
  };
  let teamsBySlot = {};
  let standingsByGroup = {};
  let playoffState = {};

  const sectionLinks = [
    ["equipes", "Equipes"],
    ["selecao", "Seleção"],
    ["calendario", "Calendário"],
    ["grupos", "Grupos"],
    ["playoffs", "Playoffs"],
    ["vods", "VODs"],
    ["estatisticas", "Estatísticas"],
    ["regras", "Regras"]
  ];
  const socialLinks = [
    { label: "Discord", url: "https://discord.gg/m9C7dbQUSV", icon: "discord.svg" },
    { label: "WhatsApp", url: "https://chat.whatsapp.com/JvqkNB8e9KyK8I8adHoKZq", icon: "whatsapp.svg" },
    { label: "Kick", url: "https://kick.com/rk-inhouse", icon: "kick.svg" },
    { label: "YouTube", url: "https://www.youtube.com/@rk-inhouse", icon: "youtube.svg" },
    { label: "Instagram", url: "https://www.instagram.com/inhouserk/", icon: "instagram.svg" },
    { label: "TikTok", url: "https://www.tiktok.com/@inhouse_rk", icon: "tiktok.svg" }
  ];

  loadContentAndRender();

  async function loadContentAndRender() {
    const remoteContent = await fetchRemoteContent();
    if (remoteContent && remoteContent.divisions) {
      contentSource = alignRemoteTeamsToOfficialDraw(remoteContent);
      content = (contentSource.divisions && contentSource.divisions[divisionKey]) || content;
    }
    renderApp();
  }

  function alignRemoteTeamsToOfficialDraw(remoteContent) {
    const officialTeams = contentData.divisions && contentData.divisions[divisionKey] && contentData.divisions[divisionKey].teams;
    const remoteTeams = remoteContent.divisions && remoteContent.divisions[divisionKey] && remoteContent.divisions[divisionKey].teams;

    if (!officialTeams || !remoteTeams || Object.keys(officialTeams).length !== 16 || Object.keys(remoteTeams).length !== 16) {
      return remoteContent;
    }

    const available = Object.entries(remoteTeams);
    const usedSlots = new Set();
    const remappedTeams = {};

    for (const slot of slotOrder) {
      const officialTeam = officialTeams[slot] || {};
      const match = available.find(([remoteSlot, remoteTeam]) => {
        if (usedSlots.has(remoteSlot)) return false;
        return sameTeamIdentity(officialTeam, remoteTeam);
      });

      if (!match) {
        return remoteContent;
      }

      usedSlots.add(match[0]);
      remappedTeams[slot] = match[1];
    }

    remoteContent.divisions[divisionKey].teams = remappedTeams;
    return remoteContent;
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

  async function fetchRemoteContent() {
    if (!contentApiUrl || window.location.protocol === "file:") {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(`${contentApiUrl}?v=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      return payload.content && payload.content.divisions ? payload.content : payload;
    } catch (error) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function renderApp() {
    teamsBySlot = normalizeTeams();
    standingsByGroup = computeStandings();
    playoffState = computePlayoffState();

    document.title = `${division.label} | LIGA RK 26.2`;

    app.innerHTML = `
      <header class="site-header">
        <a class="brand" href="index.html" aria-label="Voltar para seleção de divisão">
          <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="LIGA RK 26.2" />
          <span>LIGA RK 26.2</span>
        </a>
        <div class="header-actions">
          ${renderSocialLinks("header-socials")}
          <nav class="division-nav" aria-label="Divisões">
            <a class="${divisionKey === "elite" ? "active" : ""}" href="elite.html">Elite</a>
            <a class="${divisionKey === "ascension" ? "active" : ""}" href="ascensao.html">Ascensão</a>
          </nav>
        </div>
      </header>

      <nav class="section-nav" aria-label="Seções da divisão">
        ${sectionLinks.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}
      </nav>

      <main class="division-page">
        ${renderTeams()}
        ${renderWeekly()}
        ${renderCalendar()}
        ${renderGroups()}
        ${renderPlayoffs()}
        ${renderVods()}
        ${renderStatistics()}
        ${renderRules()}
      </main>
      ${renderFooter()}
    `;
    restoreDivisionScrollPosition();
    setupDivisionNavScrollTransfer();
    setupVodCarousels();
    hydrateVodTitles();
  }

  function normalizeTeams() {
    return slotOrder.reduce((teams, slot, index) => {
      const raw = (content.teams && content.teams[slot]) || {};
      const legacy = (division.teams && division.teams[index]) || {};
      const autoTeam = (replayStats.teamSummaries && replayStats.teamSummaries[slot]) || {};

      teams[slot] = {
        slot,
        name: raw.name || "",
        tag: raw.tag || "",
        logo: raw.logo || legacy.logo || "",
        avgWinTime: replayStats.hasData && autoTeam.wins ? autoTeam.avgWinTime : raw.avgWinTime || "00:00",
        players: laneOrder.map((lane, playerIndex) => {
          const rawPlayer = (raw.players && raw.players[playerIndex]) || {};
          const legacyPlayer = (legacy.players && legacy.players[playerIndex]) || {};
          return {
            lane,
            player: normalizeRosterPlayerName(rawPlayer.player || legacyPlayer.player),
            opgg: rawPlayer.opgg || legacyPlayer.opgg || "",
            riotId: rawPlayer.riotId || legacyPlayer.riotId || "",
            playerId: rawPlayer.playerId || legacyPlayer.playerId || "",
            teamSlot: slot,
            captain: Boolean(rawPlayer.captain)
          };
        })
      };
      return teams;
    }, {});
  }

  function computeStandings() {
    if (!groupStandings) return {};
    return groupStandings.compute({
      rounds: division.rounds || [],
      resolveResult: (roundIndex, gameIndex) => getResult(roundIndex, gameIndex),
      resolveTeam: (slot) => teamsBySlot[slot]
    });
  }

  function computePlayoffState() {
    const matches = {};
    const winnersByTitle = {};

    (division.playoffs || []).forEach((column, columnIndex) => {
      (column || []).forEach((match, matchIndex) => {
        const key = playoffKey(columnIndex, matchIndex);
        const result = getPlayoffResult(columnIndex, matchIndex);
        const teamA = resolvePlayoffTeam(match.teamA, winnersByTitle);
        const teamB = resolvePlayoffTeam(match.teamB, winnersByTitle);
        const scoreA = parseSeriesScore(result.teamAScore);
        const scoreB = parseSeriesScore(result.teamBScore);
        const maxScore = maxSeriesScore(match);
        let winnerSide = "";
        let eliminatedSide = "";

        if (scoreA === maxScore && scoreA > (scoreB ?? -1)) {
          winnerSide = "A";
          eliminatedSide = "B";
          storePlayoffWinner(winnersByTitle, match.title, teamA);
        } else if (scoreB === maxScore && scoreB > (scoreA ?? -1)) {
          winnerSide = "B";
          eliminatedSide = "A";
          storePlayoffWinner(winnersByTitle, match.title, teamB);
        }

        matches[key] = {
          teamA,
          teamB,
          scoreA,
          scoreB,
          winnerSide,
          eliminatedSide
        };
      });
    });

    return { matches, winnersByTitle };
  }

  function renderSocialLinks(extraClass) {
    return `
      <nav class="social-links ${extraClass}" aria-label="Comunidade">
        ${socialLinks
          .map(
            (item) => `
              <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer" aria-label="${escapeAttribute(item.label)}">
                <img src="assets/social/${escapeAttribute(item.icon)}" alt="" />
              </a>
            `
          )
          .join("")}
      </nav>
    `;
  }

  function renderFooter() {
    return `
      <footer class="site-footer">
        <img class="footer-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="LIGA RK 26.2" />
        <div class="footer-copy">
          <strong>LIGA RK 26.2</strong>
          <span>${escapeHtml(division.label)}</span>
        </div>
        ${renderSocialLinks("footer-socials")}
      </footer>
    `;
  }

  function sectionHeader(title) {
    return `
      <div class="section-titlebar">
        <img class="section-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="" />
        <h2>${escapeHtml(title)}</h2>
        <img class="section-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="" />
      </div>
    `;
  }

  function renderLockedContent(lockKey, body) {
    const message = publicSectionLocks[lockKey];

    if (!message) {
      return body;
    }

    return `
      <div class="locked-content" aria-label="${escapeAttribute(message)}">
        <div class="locked-content-body" aria-hidden="true">
          ${body}
        </div>
        <div class="locked-ribbon" role="note">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function renderWeekly() {
    const weeklySelection = content.weeklySelection || division.weeklySelection || [];
    const highlightIndex = weeklyHighlightIndex(weeklySelection);

    return `
      <section class="visual-section weekly-section" id="selecao">
        ${sectionHeader("SELEÇÃO DA SEMANA")}
        <p class="update-strip">${escapeHtml(division.updateText)}</p>
        <div class="lineup">
          ${weeklySelection.map((player, index) => renderPlayer(player, index, index === highlightIndex)).join("")}
        </div>
      </section>
    `;
  }

  function renderPlayer(player, index, highlighted) {
    const image = player.image
      ? `<img src="${escapeAttribute(player.image)}" alt="${escapeAttribute(player.player || "JOGADOR")}" />`
      : `<img class="placeholder-logo-img" src="${escapeAttribute(rkPlaceholderUrl)}" alt="" loading="lazy" />`;
    const role = player.role || "";
    const teamText = resolveTeamText(player.team || "EQUIPE");
    const laneIcon = getLaneIcon(normalizeLane(role), role);

    return `
      <article class="player-card player-${index + 1} ${highlighted ? "weekly-highlight" : ""}">
        ${highlighted ? `<div class="weekly-highlight-badge">DESTAQUE DA SEMANA</div>` : ""}
        <div class="player-photo ${player.image ? "" : "player-photo-placeholder"}">${image}</div>
        <div class="player-name">${escapeHtml(player.player || "JOGADOR")}</div>
        <div class="player-meta">
          ${renderWeeklyTeamLogo(player)}
          <span class="weekly-team-name">${escapeHtml(teamText)}</span>
          <span class="weekly-lane-icon">${laneIcon}</span>
        </div>
      </article>
    `;
  }

  function renderWeeklyTeamLogo(player) {
    const teamLogo = player.teamLogo || (isSlot(player.team) && teamsBySlot[player.team] && teamsBySlot[player.team].logo) || "";

    if (teamLogo) {
      return `<span class="weekly-team-logo"><img src="${escapeAttribute(teamLogo)}" alt="${escapeAttribute(resolveTeamText(player.team || "EQUIPE"))}" /></span>`;
    }

    return `<span class="weekly-team-logo rk-logo-placeholder"><img src="${escapeAttribute(rkPlaceholderUrl)}" alt="" loading="lazy" /></span>`;
  }

  function weeklyHighlightIndex(weeklySelection) {
    const highlightRole = String(content.weeklyHighlight || division.weeklyHighlight || "MID").toUpperCase();
    const roleIndex = weeklySelection.findIndex((player) => String(player.role || "").toUpperCase() === highlightRole);

    if (roleIndex >= 0) {
      return roleIndex;
    }

    const legacyMvp = content.mvp && String(content.mvp.player || "").trim();
    if (legacyMvp && legacyMvp.toUpperCase() !== "JOGADOR") {
      const playerIndex = weeklySelection.findIndex((player) => String(player.player || "").trim() === legacyMvp);
      if (playerIndex >= 0) {
        return playerIndex;
      }
    }

    return Math.min(2, weeklySelection.length - 1);
  }

  function renderCalendar() {
    return `
      <section class="visual-section calendar-section" id="calendario">
        ${sectionHeader(division.calendarTitle)}
        ${renderLockedContent("calendar", `
          <div class="round-grid">
            ${(division.rounds || []).map((round, roundIndex) => renderRound(round, roundIndex)).join("")}
          </div>
        `)}
      </section>
    `;
  }

  function renderRound(round, roundIndex) {
    return `
      <article class="round-card">
        <header>${escapeHtml(round.name)} - ${escapeHtml(round.date)}</header>
        <div class="game-list">
          ${(round.games || []).map((game, gameIndex) => renderCalendarGame(game, roundIndex, gameIndex)).join("")}
        </div>
      </article>
    `;
  }

  function renderCalendarGame(game, roundIndex, gameIndex) {
    const normalized = normalizeGame(game);
    const result = getResult(roundIndex, gameIndex);
    const homeScore = scoreLabel(result.homeScore);
    const awayScore = scoreLabel(result.awayScore);

    return `
      <div class="game-row">
        <span class="game-time">${escapeHtml(result.time || normalized.time)}</span>
        ${renderCalendarLogo(normalized.home)}
        <span class="team-code">${escapeHtml(calendarTeamName(normalized.home))}</span>
        <span class="game-score">${escapeHtml(homeScore)}</span>
        <span class="versus">X</span>
        <span class="game-score">${escapeHtml(awayScore)}</span>
        <span class="team-code team-code-away">${escapeHtml(calendarTeamName(normalized.away))}</span>
        ${renderCalendarLogo(normalized.away)}
      </div>
    `;
  }

  function renderCalendarLogo(slot) {
    const team = teamsBySlot[slot];

    if (team && team.logo) {
      return `<span class="calendar-logo"><img src="${escapeAttribute(team.logo)}" alt="${escapeAttribute(teamName(slot))}" /></span>`;
    }

    return `<span class="calendar-logo rk-logo-placeholder"><img src="${escapeAttribute(rkPlaceholderUrl)}" alt="" loading="lazy" /></span>`;
  }

  function renderGroups() {
    return `
      <section class="visual-section groups-section" id="grupos">
        ${sectionHeader(division.groupsTitle)}
        ${renderLockedContent("groups", `
          <div class="groups-grid">
            ${groupLetters.map((group, index) => renderGroup(group, index)).join("")}
          </div>
        `)}
      </section>
    `;
  }

  function renderGroup(group, index) {
    const groupName = (division.groups && division.groups[index] && division.groups[index].name) || `GRUPO ${group}`;

    return `
      <article class="group-card">
        <header>
          <span class="group-title">${escapeHtml(groupName)}</span>
          <span class="stat-label">V</span>
          <span class="stat-label">D</span>
          <span class="stat-label">SJ</span>
          <span class="stat-label">J</span>
          <span class="stat-label stat-label-tmv">TMV</span>
        </header>
        <div>
          ${(standingsByGroup[group] || []).map(renderStandingRow).join("")}
        </div>
      </article>
    `;
  }

  function renderStandingRow(entry, index) {
    return `
      <div class="standing-row">
        <span class="standing-position">${index + 1}</span>
        ${renderStandingLogo(entry.slot)}
        <span class="standing-team">${escapeHtml(calendarTeamName(entry.slot))}</span>
        <span class="standing-stat">${escapeHtml(entry.wins)}</span>
        <span class="standing-stat">${escapeHtml(entry.losses)}</span>
        <span class="standing-stat standing-game-diff">${escapeHtml(formatGameDiff(entry.gameDiff))}</span>
        <span class="standing-stat">${escapeHtml(entry.games)}</span>
        <span class="standing-time">${escapeHtml(entry.team.avgWinTime || "00:00")}</span>
      </div>
    `;
  }

  function renderStandingLogo(slot) {
    const team = teamsBySlot[slot];

    if (team && team.logo) {
      return `<span class="standing-logo"><img src="${escapeAttribute(team.logo)}" alt="${escapeAttribute(teamName(slot))}" /></span>`;
    }

    return `<span class="standing-logo rk-logo-placeholder"><img src="${escapeAttribute(rkPlaceholderUrl)}" alt="" loading="lazy" /></span>`;
  }

  function formatGameDiff(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
  }

  function renderPlayoffs() {
    return `
      <section class="visual-section playoffs-section" id="playoffs">
        ${sectionHeader(division.playoffsTitle)}
        ${renderLockedContent("playoffs", `
          <div class="bracket-grid">
            ${(division.playoffs || []).map(renderBracketColumn).join("")}
          </div>
        `)}
      </section>
    `;
  }

  function renderBracketColumn(matches, index) {
    return `
      <div class="bracket-column bracket-column-${index + 1}">
        ${matches.map((match, matchIndex) => renderMatch(match, index, matchIndex)).join("")}
      </div>
    `;
  }

  function renderMatch(match, columnIndex, matchIndex) {
    const state = playoffState.matches[playoffKey(columnIndex, matchIndex)] || {};

    return `
      <article class="match-card">
        <header>
          <strong>${escapeHtml(match.title)}</strong>
          <span>${escapeHtml(match.date)}<br />${escapeHtml(match.time)}<br />${escapeHtml(match.format)}</span>
        </header>
        ${renderMatchTeam(state.teamA, state.scoreA, state.eliminatedSide === "A", state.winnerSide === "A")}
        ${renderMatchTeam(state.teamB, state.scoreB, state.eliminatedSide === "B", state.winnerSide === "B")}
      </article>
    `;
  }

  function renderMatchTeam(team, score, eliminated, winner) {
    const classes = ["match-team"];
    if (eliminated) {
      classes.push("eliminated");
    }
    if (winner) {
      classes.push("winner");
    }

    return `
      <div class="${classes.join(" ")}">
        ${renderMatchLogo(team && team.slot)}
        <span class="match-name">${escapeHtml((team && team.text) || "")}</span>
        <span class="match-score">${escapeHtml(score === null || score === undefined ? "" : score)}</span>
      </div>
    `;
  }

  function renderMatchLogo(slot) {
    const team = slot && teamsBySlot[slot];

    if (team && team.logo) {
      return `<span class="match-logo"><img src="${escapeAttribute(team.logo)}" alt="${escapeAttribute(teamName(slot))}" /></span>`;
    }

    return `<span class="match-logo rk-logo-placeholder"><img src="${escapeAttribute(rkPlaceholderUrl)}" alt="" loading="lazy" /></span>`;
  }

  function renderTeams() {
    return `
      <section class="visual-section teams-section" id="equipes">
        ${sectionHeader(division.teamsTitle)}
        <div class="teams-grid">
          ${slotOrder.map((slot) => renderTeam(teamsBySlot[slot])).join("")}
        </div>
      </section>
    `;
  }

  function renderTeam(team) {
    const hasRoster = hasRegisteredRoster(team);
    const displayName = hasRoster ? team.name : "VAGA DISPONÍVEL";
    const logo = team.logo
      ? `<img class="team-logo" src="${escapeAttribute(team.logo)}" alt="${escapeAttribute(teamName(team.slot))}" />`
      : `<img class="team-logo team-logo-placeholder" src="${escapeAttribute(rkPlaceholderUrl)}" alt="" loading="lazy" />`;

    const teamUrl = `time.html?division=${divisionKey}&id=${encodeURIComponent(team.slot)}`;
    const heading = hasRoster
      ? `<a class="team-card-link" href="${teamUrl}"><span>${escapeHtml(displayName)}</span><small>${escapeHtml(team.tag || team.slot)}</small></a>`
      : escapeHtml(displayName);

    return `
      <article class="team-card ${hasRoster ? "has-roster" : "team-card-vacant"}" ${hasRoster ? 'tabindex="0"' : ""} aria-label="${escapeAttribute(displayName)}">
        <header>${heading}</header>
        <div class="team-card-body">
          <div class="team-logo-stage">${logo}</div>
          ${
            hasRoster
              ? `<div class="team-roster" aria-label="Jogadores">${(team.players || []).filter(isFilledRosterPlayer).map(renderTeamPlayer).join("")}</div>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function hasRegisteredRoster(team) {
    const teamNameValue = String(team.name || "").trim().toUpperCase();
    const hasTeamName = teamNameValue && teamNameValue !== "NOME DO TIME" && teamNameValue !== "VAGA DISPONÍVEL";
    const hasPlayer = (team.players || []).some((player) => {
      return isFilledRosterPlayer(player);
    });

    return Boolean(hasTeamName && hasPlayer);
  }

  function normalizeRosterPlayerName(value) {
    const name = String(value || "").trim();
    return /^(?:jogador|player|-|--|sub|vaga dispon[ií]vel)$/i.test(name) ? "" : name;
  }

  function isFilledRosterPlayer(player) {
    return Boolean(normalizeRosterPlayerName(player && (player.player || player.name)));
  }

  function renderTeamPlayer(player) {
    const lane = normalizeLane(player.lane);
    const laneIcon = getLaneIcon(lane, player.lane);
    const opgg = player.opgg
      ? `<a class="opgg-link" href="${escapeAttribute(player.opgg)}" target="_blank" rel="noreferrer" aria-label="OP.GG de ${escapeAttribute(player.player)}">OP<br />GG</a>`
      : `<span class="opgg-link opgg-placeholder" aria-hidden="true">OP<br />GG</span>`;
    const captain = player.captain
      ? `<span class="captain-crown" title="Capitão" aria-label="Capitão">♛</span>`
      : `<span class="captain-crown captain-empty" aria-hidden="true"></span>`;

    const playerId = resolveRosterPlayerId(player);
    const playerName = escapeHtml(normalizeRosterPlayerName(player.player));
    const playerLabel = playerId
      ? `<a class="roster-player" href="jogador.html?division=${divisionKey}&id=${encodeURIComponent(playerId)}">${playerName}</a>`
      : `<span class="roster-player">${playerName}</span>`;

    return `
      <div class="roster-row">
        ${laneIcon}
        ${playerLabel}
        ${captain}
        ${opgg}
      </div>
    `;
  }

  function resolveRosterPlayerId(player) {
    const playerName = normalizeRosterPlayerName(player.player).toUpperCase();
    const isPlaceholder = !playerName;
    if (isPlaceholder && !player.opgg && !player.riotId) return "";
    if (player.playerId) return player.playerId;
    const normalizedName = normalizeLookup(player.player);
    const normalizedRiotId = normalizeLookup(player.riotId);
    const match = (replayStats.players || []).find((candidate) => {
      const belongsToTeam = (candidate.teams || []).some((team) => team.slot === player.teamSlot);
      return belongsToTeam && (
        (normalizedName && normalizeLookup(candidate.displayName) === normalizedName) ||
        (normalizedRiotId && normalizeLookup(candidate.riotId) === normalizedRiotId)
      );
    });
    return match && (match.playerId || match.id) || "";
  }

  function normalizeLookup(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function getLaneIcon(lane, label) {
    const iconPath = {
      top: "assets/lane-icons/top-white.png",
      jg: "assets/lane-icons/jg-white.png",
      mid: "assets/lane-icons/mid-white.png",
      adc: "assets/lane-icons/adc-white.png",
      sup: "assets/lane-icons/sup-white.png"
    }[lane];

    if (!iconPath) {
      return `<span class="lane-icon lane-sub" aria-label="${escapeAttribute(label || "SUB")}"></span>`;
    }

    return `<img class="lane-icon lane-image" src="${iconPath}" alt="${escapeAttribute(label)}" />`;
  }

  function renderVods() {
    const vods = getVods();
    const navigation =
      vods.length > 1
        ? `
          <button class="vod-arrow vod-prev" type="button" aria-label="VOD anterior" data-vod-prev>&#8249;</button>
          <button class="vod-arrow vod-next" type="button" aria-label="PrÃ³ximo VOD" data-vod-next>&#8250;</button>
        `
        : "";

    return `
      <section class="visual-section vods-section" id="vods">
        ${sectionHeader(division.vodsTitle)}
        ${renderLockedContent("vods", `
          <div class="vod-feature" data-vod-carousel>
            <div class="vod-slides">
              ${vods.map(renderVodSlide).join("")}
            </div>
            ${navigation}
          </div>
        `)}
      </section>
    `;
  }

  function renderVodSlide(vod, index) {
    const thumbnail = vod.thumbnail || youtubeThumbnail(vod.url);
    const thumbStyle = thumbnail ? ` style="--vod-thumbnail: url('${escapeAttribute(thumbnail)}')"` : "";
    const title = vod.title || youtubeTitleFallback(vod.url);
    const autoTitle = vod.url && !vod.title ? "true" : "false";
    const videoId = youtubeVideoId(vod.url);
    const canEmbed = videoId && window.location.protocol !== "file:";
    const vodBody = canEmbed
      ? `
        <div class="vod-frame vod-player">
          <iframe
            class="vod-embed"
            src="https://www.youtube.com/embed/${escapeAttribute(videoId)}?rel=0&modestbranding=1&playsinline=1"
            title="${escapeAttribute(title)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          ></iframe>
        </div>
      `
      : vod.url
        ? `<a class="vod-frame ${thumbnail ? "has-thumb" : ""}" href="${escapeAttribute(vod.url)}" target="_blank" rel="noreferrer"${thumbStyle}>${playIcon()}</a>`
        : `<div class="vod-frame ${thumbnail ? "has-thumb" : ""}"${thumbStyle}></div>`;

    return `
      <article class="vod-slide ${index === 0 ? "active" : ""}" data-vod-slide>
        ${vodBody}
        <div class="vod-caption" data-vod-title data-vod-url="${escapeAttribute(vod.url || "")}" data-vod-auto-title="${autoTitle}">
          ${escapeHtml(title)}
        </div>
      </article>
    `;
  }

  function renderStatistics() {
    const stats = replayStats.hasData && replayStats.statistics ? replayStats.statistics : content.statistics || division.statistics || {};

    return `
      <section class="visual-section statistics-section" id="estatisticas">
        ${sectionHeader("ESTATÍSTICAS")}
        ${renderLockedContent("statistics", `
          <div class="statistics-layout">
          ${renderChampionStat(stats.mostPicked, "MAIS ESCOLHAS")}
          <div class="player-stat-list">
            ${(stats.playerStats || []).map(renderPlayerStat).join("")}
          </div>
          ${renderChampionStat(stats.mostWins, "MAIS VITÓRIAS")}
          </div>
        `)}
        <a class="statistics-more-link" href="estatisticas.html?division=${divisionKey}">Ver todas as estat&iacute;sticas</a>
      </section>
    `;
  }

  function renderChampionStat(stat = {}, fallbackTitle) {
    const championName = stat.champion || "AATROX";
    const value = stat.value ?? 0;
    const image = stat.image
      ? `<img src="${escapeAttribute(stat.image)}" alt="${escapeAttribute(championName)}" />`
      : `<span class="champion-image-placeholder" aria-hidden="true"></span>`;

    return `
      <article class="champion-stat-card">
        <header>${escapeHtml(stat.title || fallbackTitle)}</header>
        <div class="champion-image">${image}</div>
        <footer>
          <span>${escapeHtml(championName)}</span>
          <strong>${escapeHtml(value)}</strong>
        </footer>
      </article>
    `;
  }

  function renderPlayerStat(stat = {}) {
    const playerName = escapeHtml(stat.player || "JOGADOR");
    const player = stat.playerId
      ? `<a href="jogador.html?division=${divisionKey}&id=${encodeURIComponent(stat.playerId)}">${playerName}</a>`
      : `<span>${playerName}</span>`;

    return `
      <article class="player-stat-card">
        <header>${escapeHtml(stat.label || "MELHOR")}</header>
        <div>
          ${player}
          <strong>${escapeHtml(stat.value || "00.00")}</strong>
        </div>
      </article>
    `;
  }

  function renderRules() {
    return `
      <section class="visual-section rules-section" id="regras">
        ${sectionHeader("REGRAS")}
        <article class="rules-reader" aria-label="Regulamento oficial da Liga RK 26.2">
          <header class="rules-reader-header">
            <div>
              <strong>Regulamento Oficial</strong>
              <span>Liga RK 26.2</span>
            </div>
            <a href="${rulesPdfUrl}" target="_blank" rel="noopener">Abrir PDF</a>
          </header>
          <div class="rules-pdf-shell">
            <iframe
              class="rules-pdf"
              title="Regulamento Oficial - Liga RK 26.2"
              src="${rulesPdfUrl}#toolbar=0&navpanes=0&zoom=80"
              loading="lazy"
            >
              Abra o regulamento em PDF: ${rulesPdfUrl}
            </iframe>
          </div>
        </article>
      </section>
    `;
  }

  function playIcon() {
    return `<span class="play-icon" aria-hidden="true"></span>`;
  }

  function setupDivisionNavScrollTransfer() {
    document.querySelectorAll(".division-nav a").forEach((link) => {
      link.addEventListener("click", () => {
        sessionStorage.setItem("liga-rk-division-scroll", String(window.scrollY));
      });
    });
  }

  function restoreDivisionScrollPosition() {
    const saved = sessionStorage.getItem("liga-rk-division-scroll");
    if (saved === null) {
      return;
    }

    sessionStorage.removeItem("liga-rk-division-scroll");
    requestAnimationFrame(() => {
      const top = Math.min(Number(saved) || 0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    });
  }

  function setupVodCarousels() {
    document.querySelectorAll("[data-vod-carousel]").forEach((carousel) => {
      const slides = Array.from(carousel.querySelectorAll("[data-vod-slide]"));
      let currentIndex = 0;

      const setActive = (nextIndex) => {
        currentIndex = (nextIndex + slides.length) % slides.length;
        slides.forEach((slide, index) => {
          slide.classList.toggle("active", index === currentIndex);
        });
      };

      const previous = carousel.querySelector("[data-vod-prev]");
      const next = carousel.querySelector("[data-vod-next]");

      if (previous && next && slides.length > 1) {
        previous.addEventListener("click", () => setActive(currentIndex - 1));
        next.addEventListener("click", () => setActive(currentIndex + 1));
      }
    });
  }

  function hydrateVodTitles() {
    document.querySelectorAll("[data-vod-title][data-vod-auto-title='true']").forEach(async (node) => {
      const url = node.dataset.vodUrl || "";

      try {
        const title = await fetchYouTubeTitle(url);
        if (title) {
          node.textContent = title;
        }
      } catch (error) {
        // Mantem o titulo padrao quando o navegador bloquear a leitura do YouTube.
      }
    });
  }

  function getVods() {
    const rawVods = Array.isArray(content.vods)
      ? content.vods
      : content.vod
        ? [content.vod]
        : Array.isArray(division.vods)
          ? division.vods
          : [division.vod || {}];
    const vods = rawVods.filter(Boolean).map(normalizeVod);

    return vods.length ? vods : [normalizeVod({})];
  }

  function normalizeVod(vod = {}) {
    return {
      url: vod.url || "",
      title: vod.title || "",
      thumbnail: vod.thumbnail || youtubeThumbnail(vod.url) || ""
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

  function getResult(roundIndex, gameIndex) {
    const key = gameKey(roundIndex, gameIndex);
    return (content.results && content.results[key]) || {};
  }

  function getPlayoffResult(columnIndex, matchIndex) {
    const key = playoffKey(columnIndex, matchIndex);
    return (content.playoffResults && content.playoffResults[key]) || {};
  }

  function gameKey(roundIndex, gameIndex) {
    return `r${roundIndex + 1}g${gameIndex + 1}`;
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

  function resolvePlayoffReference(reference) {
    return resolvePlayoffTeam(reference, playoffState.winnersByTitle).text;
  }

  function resolvePlayoffTeam(reference, winnersByTitle) {
    const text = String(reference || "");
    const winnerMatch = /^VENCEDOR\s+(.+)$/i.exec(text);

    if (winnerMatch) {
      return getPlayoffWinner(winnersByTitle, winnerMatch[1]) || { text, slot: "" };
    }

    if (!isSlot(text)) {
      return { text, slot: "" };
    }

    const group = text[0];
    const position = Number(text[1]) - 1;
    const entry = standingsByGroup[group] && standingsByGroup[group][position];

    return entry ? { text: teamName(entry.slot), slot: entry.slot } : { text, slot: "" };
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

  function resolveTeamText(value) {
    return isSlot(value) ? teamName(value) : value;
  }

  function teamName(slot) {
    const team = teamsBySlot[slot];
    const name = team && String(team.name || "").trim();
    return name || slot;
  }

  function calendarTeamName(slot) {
    const team = teamsBySlot[slot];
    const tag = team && String(team.tag || "").trim();
    return tag ? tag.slice(0, 4).toUpperCase() : slot;
  }

  function isSlot(value) {
    return /^[ABCD][1-4]$/.test(String(value || ""));
  }

  function parseScore(value) {
    const text = String(value ?? "").trim();

    if (text === "") {
      return null;
    }

    const score = Number(text);
    if (!Number.isInteger(score)) {
      return null;
    }

    return Math.max(0, Math.min(2, score));
  }

  function parseSeriesScore(value) {
    const text = String(value ?? "").trim();

    if (text === "") {
      return null;
    }

    const score = Number(text);
    if (!Number.isInteger(score)) {
      return null;
    }

    return Math.max(0, score);
  }

  function scoreLabel(value) {
    const score = parseScore(value);
    return score === null ? "" : String(score);
  }

  function maxSeriesScore(match) {
    return String(match && match.format).toUpperCase() === "MD5" ? 3 : 2;
  }

  function timeToSeconds(value) {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || "99:59").trim());

    if (!match) {
      return 5999;
    }

    return Number(match[1]) * 60 + Number(match[2]);
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

  function normalizeLane(lane) {
    return String(lane || "sub").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
})();
