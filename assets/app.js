(function () {
  const fixedData = window.LIGA_RK_DATA;
  const contentData = window.LIGA_RK_CONTENT || {};
  const replayStatsData = window.LIGA_RK_STATS || {};
  const divisionKey = document.body.dataset.division;
  const division = fixedData && fixedData[divisionKey];
  const content = (contentData.divisions && contentData.divisions[divisionKey]) || {};
  const replayStats = (replayStatsData.divisions && replayStatsData.divisions[divisionKey]) || {};
  const app = document.getElementById("app");

  if (!app || !division) {
    return;
  }

  const groupLetters = ["A", "B", "C", "D"];
  const laneOrder = ["TOP", "JG", "MID", "ADC", "SUP", "SUB", "SUB", "SUB"];
  const slotOrder = groupLetters.flatMap((group) => [1, 2, 3, 4].map((seed) => `${group}${seed}`));
  const teamsBySlot = normalizeTeams();
  const standingsByGroup = computeStandings();
  const playoffState = computePlayoffState();

  const sectionLinks = [
    ["selecao", "Seleção"],
    ["calendario", "Calendário"],
    ["grupos", "Grupos"],
    ["playoffs", "Playoffs"],
    ["equipes", "Equipes"],
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

  document.title = `${division.label} | LIGA RK 26.2`;

  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="index.html" aria-label="Voltar para seleção de divisão">
        <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg.png" alt="LIGA RK 26.2" />
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
      ${renderWeekly()}
      ${renderCalendar()}
      ${renderGroups()}
      ${renderPlayoffs()}
      ${renderTeams()}
      ${renderVods()}
      ${renderStatistics()}
      ${renderRules()}
    </main>
    ${renderFooter()}
  `;
  restoreDivisionScrollPosition();
  setupDivisionNavScrollTransfer();
  setupSmoothPageScroll();
  setupVodCarousels();
  hydrateVodTitles();

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
            player: rawPlayer.player || legacyPlayer.player || "JOGADOR",
            opgg: rawPlayer.opgg || legacyPlayer.opgg || "",
            captain: Boolean(rawPlayer.captain)
          };
        })
      };
      return teams;
    }, {});
  }

  function computeStandings() {
    const standings = groupLetters.reduce((groups, group) => {
      groups[group] = [1, 2, 3, 4].map((seed, index) => {
        const slot = `${group}${seed}`;
        return {
          slot,
          seed: index,
          team: teamsBySlot[slot],
          wins: 0,
          losses: 0,
          games: 0
        };
      });
      return groups;
    }, {});
    const entriesBySlot = Object.fromEntries(
      Object.values(standings)
        .flat()
        .map((entry) => [entry.slot, entry])
    );

    (division.rounds || []).forEach((round, roundIndex) => {
      (round.games || []).forEach((game, gameIndex) => {
        const normalized = normalizeGame(game);
        const result = getResult(roundIndex, gameIndex);
        const homeScore = parseScore(result.homeScore);
        const awayScore = parseScore(result.awayScore);

        if (homeScore === null || awayScore === null || !entriesBySlot[normalized.home] || !entriesBySlot[normalized.away]) {
          return;
        }

        applyGroupScore(entriesBySlot[normalized.home], homeScore);
        applyGroupScore(entriesBySlot[normalized.away], awayScore);
      });
    });

    Object.keys(standings).forEach((group) => {
      standings[group].sort((a, b) => {
        return (
          b.wins - a.wins ||
          timeToSeconds(a.team.avgWinTime) - timeToSeconds(b.team.avgWinTime) ||
          a.losses - b.losses ||
          a.seed - b.seed
        );
      });
    });

    return standings;
  }

  function applyGroupScore(entry, score) {
    entry.wins += score;
    entry.losses += Math.max(0, 2 - score);
    entry.games += 2;
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
        <img class="footer-logo logo-white" src="assets/logo_liga_rk_nobg.png" alt="LIGA RK 26.2" />
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
        <img class="section-logo logo-white" src="assets/logo_liga_rk_nobg.png" alt="" />
        <h2>${escapeHtml(title)}</h2>
        <img class="section-logo logo-white" src="assets/logo_liga_rk_nobg.png" alt="" />
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
      : `<span class="portrait-placeholder" aria-hidden="true"><span></span></span>`;
    const role = player.role || "";
    const teamText = resolveTeamText(player.team || "EQUIPE");
    const laneIcon = getLaneIcon(normalizeLane(role), role);

    return `
      <article class="player-card player-${index + 1} ${highlighted ? "weekly-highlight" : ""}">
        ${highlighted ? `<div class="weekly-highlight-badge">DESTAQUE DA SEMANA</div>` : ""}
        <div class="player-photo">${image}</div>
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

    return `<span class="weekly-team-logo"><span class="team-mark" aria-hidden="true"></span></span>`;
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
        <div class="round-grid">
          ${(division.rounds || []).map((round, roundIndex) => renderRound(round, roundIndex)).join("")}
        </div>
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

    return `<span class="calendar-logo"><span class="team-mark" aria-hidden="true"></span></span>`;
  }

  function renderGroups() {
    return `
      <section class="visual-section groups-section" id="grupos">
        ${sectionHeader(division.groupsTitle)}
        <div class="groups-grid">
          ${groupLetters.map((group, index) => renderGroup(group, index)).join("")}
        </div>
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
        <span class="standing-team">${escapeHtml(teamName(entry.slot))}</span>
        <span class="standing-stat">${escapeHtml(entry.wins)}</span>
        <span class="standing-stat">${escapeHtml(entry.losses)}</span>
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

    return `<span class="standing-logo"><span class="team-mark" aria-hidden="true"></span></span>`;
  }

  function renderPlayoffs() {
    return `
      <section class="visual-section playoffs-section" id="playoffs">
        ${sectionHeader(division.playoffsTitle)}
        <div class="bracket-grid">
          ${(division.playoffs || []).map(renderBracketColumn).join("")}
        </div>
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

    return `<span class="match-logo"><span class="team-mark" aria-hidden="true"></span></span>`;
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
    const logo = team.logo
      ? `<img class="team-logo" src="${escapeAttribute(team.logo)}" alt="${escapeAttribute(teamName(team.slot))}" />`
      : `<span class="team-crest-placeholder" aria-hidden="true"></span>`;

    return `
      <article class="team-card" tabindex="0" aria-label="${escapeAttribute(teamName(team.slot))}">
        <header>${escapeHtml(team.name || "NOME DO TIME")}</header>
        <div class="team-card-body">
          <div class="team-logo-stage">${logo}</div>
          <div class="team-roster" aria-label="Jogadores">
            ${(team.players || []).map(renderTeamPlayer).join("")}
          </div>
        </div>
      </article>
    `;
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

    return `
      <div class="roster-row">
        ${laneIcon}
        <span class="roster-player">${escapeHtml(player.player || "JOGADOR")}</span>
        ${captain}
        ${opgg}
      </div>
    `;
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
        <div class="vod-feature" data-vod-carousel>
          <div class="vod-slides">
            ${vods.map(renderVodSlide).join("")}
          </div>
          ${navigation}
        </div>
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
        <div class="statistics-layout">
          ${renderChampionStat(stats.mostPicked, "MAIS ESCOLHAS")}
          <div class="player-stat-list">
            ${(stats.playerStats || []).map(renderPlayerStat).join("")}
          </div>
          ${renderChampionStat(stats.mostWins, "MAIS VITÓRIAS")}
        </div>
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
    return `
      <article class="player-stat-card">
        <header>${escapeHtml(stat.label || "MELHOR")}</header>
        <div>
          <span>${escapeHtml(stat.player || "JOGADOR")}</span>
          <strong>${escapeHtml(stat.value || "00.00")}</strong>
        </div>
      </article>
    `;
  }

  function renderRules() {
    const rules = String(content.rules || "").trim();
    const body = rules
      ? `<div class="rules-content">${escapeHtml(rules).replace(/\n/g, "<br />")}</div>`
      : "";

    return `
      <section class="visual-section rules-section blank-section" id="regras">
        ${sectionHeader("REGRAS")}
        ${body}
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

  function setupSmoothPageScroll() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let targetY = window.scrollY;
    let frame = 0;
    const clamp = (value) => Math.max(0, Math.min(value, document.documentElement.scrollHeight - window.innerHeight));

    const animate = () => {
      const delta = targetY - window.scrollY;
      if (Math.abs(delta) < 0.7) {
        window.scrollTo(0, targetY);
        frame = 0;
        return;
      }

      window.scrollTo(0, window.scrollY + delta * 0.22);
      frame = requestAnimationFrame(animate);
    };

    const requestScroll = (nextY) => {
      targetY = clamp(nextY);
      if (!frame) {
        frame = requestAnimationFrame(animate);
      }
    };

    window.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey) {
          return;
        }

        event.preventDefault();
        requestScroll(targetY + event.deltaY);
      },
      { passive: false }
    );

    window.addEventListener("keydown", (event) => {
      const step = window.innerHeight * 0.78;
      const keys = {
        ArrowDown: 90,
        ArrowUp: -90,
        PageDown: step,
        PageUp: -step,
        Home: -Infinity,
        End: Infinity
      };

      if (!(event.key in keys) || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? document.documentElement.scrollHeight : targetY + keys[event.key];
      requestScroll(next);
    });

    document.querySelectorAll(".section-nav a[href^='#']").forEach((link) => {
      link.addEventListener("click", (event) => {
        const target = document.querySelector(link.getAttribute("href"));
        if (!target) {
          return;
        }

        event.preventDefault();
        requestScroll(window.scrollY + target.getBoundingClientRect().top - 72);
      });
    });

    window.addEventListener("scroll", () => {
      if (!frame) {
        targetY = window.scrollY;
      }
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
