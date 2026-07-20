(function () {
  const GROUPS = ["A", "B", "C", "D"];
  const POT_COUNT = 4;

  const CONFIG = {
    elite: {
      label: "Divisão Elite",
      exportName: "sorteio-grupos-elite.json",
      teams: [
        team(1, "FAVELÃO DO TECHY", "FVL", "equipes_elite/fvl.png"),
        team(1, "NKZ REVENGERS", "NKZ", "equipes_elite/nkz.png"),
        team(1, "CUPULA DO TRIPLE T", "TTT", "equipes_elite/ttt.png"),
        team(1, "LENDINHAS", "IDL", "equipes_elite/idl.png"),
        team(2, "BANDO DO ROSA", "BDR", "equipes_elite/bdr.png"),
        team(2, "M7 ESPORTS", "M7", "equipes_elite/m7.png"),
        team(2, "CASHOUT & TRIMILIQUE LTDA", "CASH", "equipes_elite/cash.png"),
        team(2, "PHOENIX GAMING BLUE", "PXB", "equipes_elite/pxb.png"),
        team(3, "BRONGUINHOS TEAM 67", "BG67", "equipes_elite/bg67.png"),
        team(3, "TOPEIRAS DO MAU", "TOP", "equipes_elite/top.png"),
        team(3, "RAVENCLAW", "RAVE", "equipes_elite/rave.png"),
        team(3, "BORRACHARIA FC", "BOR", "equipes_elite/bor.png"),
        team(4, "NEW AGS", "AGS", "equipes_elite/ags.png"),
        team(4, "TEAM SOLO BAHIA", "TSB", "equipes_elite/tsb.png"),
        team(4, "TEAM LEGATI", "LEGA", "equipes_elite/lega.png"),
        team(4, "QUANTUM RABBITS", "QR", "equipes_elite/qr.png")
      ]
    },
    ascension: {
      label: "Divisão Ascensão",
      exportName: "sorteio-grupos-ascensao.json",
      teams: [
        team(1, "PHOENIX GAMING", "PXG", "equipes_ascensao/pxg.png"),
        team(1, "TENEBRA BEHEMOT", "TNB", "equipes_ascensao/tnb.png"),
        team(1, "FAVELINHA REFORMED", "FVLR", "equipes_ascensao/fvlr.png"),
        team(1, "RENEGADOS", "RNG", "equipes_ascensao/rng.png"),
        team(2, "FAINA", "FIN", "equipes_ascensao/fin.png"),
        team(2, "RAISING DRAGONS", "RDG", "equipes_ascensao/rdg.png"),
        team(2, "THE KILLERS T7", "TKT7", "equipes_ascensao/tkt7.png"),
        team(2, "FOFOLETES DO RICK", "FFLT", "equipes_ascensao/fflt.png"),
        team(3, "SKYLINE", "SKY", "equipes_ascensao/sky.png"),
        team(3, "INAZUMA V", "INZ", "equipes_ascensao/inz.png"),
        team(3, "UBERS", "UBR", "equipes_ascensao/ubr.png"),
        team(3, "GANGUE DE GOBLINS", "GDG", "equipes_ascensao/gdg.png"),
        team(4, "BASTARD", "BSTD", "equipes_ascensao/bstd.png"),
        team(4, "SKY KNIGHTS", "SKS", "equipes_ascensao/sks.png"),
        team(4, "TENEBRA LEVIATHAN", "TNL", "equipes_ascensao/tnl.png"),
        team(4, "BLACK STARS", "BKS", "equipes_ascensao/bks.png")
      ]
    }
  };

  const divisionKey = document.body.dataset.division;
  const config = CONFIG[divisionKey];
  const app = document.getElementById("draw-app");

  if (!config || !app) return;

  const state = createState();
  let autoPlacementTimer = 0;
  let closeWheelTimer = 0;
  let candidateTickerTimer = 0;
  let wheelAnimation = null;

  renderShell();
  render();

  function team(pot, name, tag, logoFile) {
    return {
      id: `${tag}-${pot}`.toLowerCase(),
      pot,
      name,
      tag,
      logo: `../assets/uploads/${logoFile}`
    };
  }

  function createState() {
    return {
      groups: Object.fromEntries(GROUPS.map((group) => [group, Array(POT_COUNT).fill(null)])),
      currentPot: 1,
      currentGroupIndex: 0,
      drawnIds: new Set(),
      history: [],
      finished: false,
      positionsShuffled: false,
      spinning: false,
      autoPlacementPending: false,
      lastTeam: null,
      notice: "Sorteio pronto. Pote 1, Grupo A."
    };
  }

  function renderShell() {
    app.innerHTML = `
      <section class="draw-shell" aria-label="Sorteio oficial ${escapeHtml(config.label)}">
        <header class="draw-topbar">
          <div class="draw-brand">
            <img src="../assets/logo_liga_rk_nobg_512.png" alt="Liga RK 26.2" />
            <div>
              <span>Liga RK 26.2</span>
              <strong>Sorteio oficial dos grupos</strong>
            </div>
          </div>
          <div class="draw-topbar-actions">
            <span class="draw-division-label">${escapeHtml(config.label)}</span>
            <button class="icon-command" id="reset-draw" type="button" title="Reiniciar sorteio" aria-label="Reiniciar sorteio">↻</button>
          </div>
        </header>

        <section class="pots-grid" id="pots-grid" aria-label="Potes"></section>

        <section class="draw-board">
          <div class="group-column" id="group-column-left"></div>
          <section class="draw-stage" aria-live="polite">
            <div class="draw-step-label" id="draw-step-label"></div>
            <div class="draw-team-stage" id="draw-team-stage"></div>
            <button class="primary-command" id="open-wheel" type="button">Roleta</button>
            <p class="draw-notice" id="draw-notice"></p>
            <div class="draw-progress" aria-label="Progresso do sorteio"><span id="draw-progress-bar"></span></div>
            <span class="draw-progress-copy" id="draw-progress-copy"></span>
            <div class="final-actions" id="final-actions" hidden>
              <button class="secondary-command" id="shuffle-positions" type="button">Sortear posições</button>
              <button class="secondary-command export-command" id="export-json" type="button">Baixar JSON</button>
            </div>
          </section>
          <div class="group-column" id="group-column-right"></div>
        </section>
      </section>

      <dialog class="wheel-dialog" id="wheel-dialog">
        <form method="dialog" class="wheel-dialog-frame">
          <header class="wheel-header">
            <div>
              <span>Liga RK 26.2</span>
              <strong>Roleta oficial</strong>
            </div>
            <button class="icon-command wheel-close" value="cancel" type="submit" aria-label="Fechar roleta">×</button>
          </header>
          <div class="wheel-body">
            <section class="wheel-context">
              <p class="wheel-destination" id="wheel-destination"></p>
              <div class="wheel-candidates" id="wheel-candidates"></div>
              <div class="wheel-winner" id="wheel-winner" hidden></div>
            </section>
            <section class="wheel-machine">
              <div class="wheel-pointer" aria-hidden="true"></div>
              <div class="wheel-rotator" id="wheel-rotator">
                <canvas id="wheel-canvas" width="720" height="720" aria-label="Roleta das equipes"></canvas>
              </div>
              <div class="wheel-live-status" id="wheel-live-status" aria-live="polite">
                <span id="wheel-live-label">Roleta preparada</span>
                <strong id="wheel-live-name">Clique em roletar</strong>
              </div>
              <button class="primary-command spin-command" id="spin-wheel" type="button">Roletar</button>
            </section>
          </div>
        </form>
      </dialog>
    `;

    document.getElementById("reset-draw").addEventListener("click", resetDraw);
    document.getElementById("open-wheel").addEventListener("click", openWheel);
    document.getElementById("spin-wheel").addEventListener("click", spinWheel);
    document.getElementById("shuffle-positions").addEventListener("click", shufflePositions);
    document.getElementById("export-json").addEventListener("click", exportJson);
    document.getElementById("wheel-dialog").addEventListener("cancel", (event) => {
      if (state.spinning) event.preventDefault();
    });
  }

  function render() {
    renderPots();
    renderGroups();
    renderStage();
  }

  function renderPots() {
    const potsGrid = document.getElementById("pots-grid");
    potsGrid.innerHTML = Array.from({ length: POT_COUNT }, (_, index) => {
      const pot = index + 1;
      const teams = config.teams.filter((entry) => entry.pot === pot);
      return `
        <article class="pot-card ${state.currentPot === pot && !state.finished ? "is-current" : ""} ${state.currentPot > pot || state.finished ? "is-complete" : ""}">
          <h2>Pote ${pot}</h2>
          <div class="pot-team-list">
            ${teams.map((entry) => `
              <div class="pot-team ${state.drawnIds.has(entry.id) ? "is-drawn" : ""}" title="${escapeAttribute(entry.name)}">
                <img src="${escapeAttribute(entry.logo)}" alt="${escapeAttribute(entry.name)}" />
                <span>${escapeHtml(entry.tag)}</span>
              </div>
            `).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderGroups() {
    document.getElementById("group-column-left").innerHTML = ["A", "B"].map(renderGroup).join("");
    document.getElementById("group-column-right").innerHTML = ["C", "D"].map(renderGroup).join("");
  }

  function renderGroup(group) {
    const isCurrent = !state.finished && GROUPS[state.currentGroupIndex] === group;
    return `
      <article class="group-card ${isCurrent ? "is-current" : ""}">
        <h2>Grupo <span>${group}</span></h2>
        <ol>
          ${state.groups[group].map((entry, index) => `
            <li class="${isCurrent && state.currentPot - 1 === index ? "is-target" : ""}">
              <strong>${index + 1}</strong>
              <div class="group-team-logo">${entry ? `<img src="${escapeAttribute(entry.logo)}" alt="" />` : ""}</div>
              <span>${entry ? escapeHtml(entry.name) : ""}</span>
              ${entry ? `<small>${escapeHtml(entry.tag)}</small>` : ""}
            </li>
          `).join("")}
        </ol>
      </article>
    `;
  }

  function renderStage() {
    const currentGroup = GROUPS[state.currentGroupIndex];
    const stepLabel = document.getElementById("draw-step-label");
    const teamStage = document.getElementById("draw-team-stage");
    const openButton = document.getElementById("open-wheel");
    const finalActions = document.getElementById("final-actions");
    const progress = state.drawnIds.size;

    if (state.finished) {
      stepLabel.innerHTML = `<span>Sorteio concluído</span><strong>Grupos definidos</strong>`;
      teamStage.innerHTML = `
        <img class="league-finish-logo" src="../assets/logo_liga_rk_nobg_512.png" alt="Liga RK 26.2" />
        <h1>Boa sorte!</h1>
      `;
      openButton.hidden = true;
      finalActions.hidden = false;
    } else {
      stepLabel.innerHTML = `<span>Etapa atual</span><strong>Pote ${state.currentPot} • Grupo ${currentGroup}</strong>`;
      teamStage.innerHTML = state.lastTeam
        ? `
          <img src="${escapeAttribute(state.lastTeam.logo)}" alt="${escapeAttribute(state.lastTeam.name)}" />
          <h1>${escapeHtml(state.lastTeam.name)}</h1>
          <span>${escapeHtml(state.lastTeam.tag)}</span>
        `
        : `
          <img class="league-waiting-logo" src="../assets/logo_rk_placeholder.png" alt="" />
          <h1>Equipe</h1>
          <span>Aguardando sorteio</span>
        `;
      openButton.hidden = false;
      openButton.disabled = state.spinning || state.autoPlacementPending;
      finalActions.hidden = true;
    }

    document.getElementById("draw-notice").textContent = state.notice;
    document.getElementById("draw-progress-bar").style.width = `${(progress / config.teams.length) * 100}%`;
    document.getElementById("draw-progress-copy").textContent = `${progress} de ${config.teams.length} equipes`;
  }

  function openWheel() {
    if (state.finished || state.spinning || state.autoPlacementPending) return;
    const remaining = getRemainingTeams();
    if (!remaining.length) return;

    const dialog = document.getElementById("wheel-dialog");
    const winner = document.getElementById("wheel-winner");
    const rotator = document.getElementById("wheel-rotator");
    const group = GROUPS[state.currentGroupIndex];

    stopWheelEffects();
    winner.hidden = true;
    winner.innerHTML = "";
    rotator.style.transform = "rotate(0deg)";
    document.getElementById("spin-wheel").disabled = false;
    document.getElementById("spin-wheel").textContent = "Roletar";
    document.querySelector(".wheel-close").disabled = false;
    document.getElementById("wheel-live-status").classList.remove("is-spinning", "is-result");
    document.getElementById("wheel-live-label").textContent = "Roleta preparada";
    document.getElementById("wheel-live-name").textContent = "Clique em roletar";
    document.getElementById("wheel-destination").innerHTML = `Pote <strong>${state.currentPot}</strong> para o Grupo <strong>${group}</strong>`;
    document.getElementById("wheel-candidates").innerHTML = remaining.map((entry) => `
      <div class="wheel-candidate" data-team-id="${escapeAttribute(entry.id)}">
        <img src="${escapeAttribute(entry.logo)}" alt="" />
        <span>${escapeHtml(entry.name)}</span>
      </div>
    `).join("");

    drawWheel(remaining);
    dialog.showModal();
  }

  function drawWheel(teams) {
    const canvas = document.getElementById("wheel-canvas");
    const context = canvas.getContext("2d");
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 18;
    const arc = (Math.PI * 2) / teams.length;
    const colors = ["#7850ff", "#13c8b5", "#e52a2a", "#f2b632"];

    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(center, center);

    teams.forEach((entry, index) => {
      const start = -Math.PI / 2 + index * arc;
      const end = start + arc;
      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, radius, start, end);
      context.closePath();
      context.fillStyle = colors[index % colors.length];
      context.fill();
      context.lineWidth = 8;
      context.strokeStyle = "#121217";
      context.stroke();

      context.save();
      context.rotate(start + arc / 2);
      context.translate(radius * 0.61, 0);
      context.rotate(Math.PI / 2);
      context.fillStyle = "#fff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `700 ${teams.length > 2 ? 34 : 42}px Anton, sans-serif`;
      context.fillText(entry.tag, 0, 0);
      context.restore();
    });

    context.beginPath();
    context.arc(0, 0, 64, 0, Math.PI * 2);
    context.fillStyle = "#17171d";
    context.fill();
    context.lineWidth = 10;
    context.strokeStyle = "#efefef";
    context.stroke();
    context.restore();
  }

  function spinWheel() {
    if (state.spinning) return;
    const remaining = getRemainingTeams();
    if (!remaining.length) return;

    state.spinning = true;
    const chosenIndex = secureRandomIndex(remaining.length);
    const chosen = remaining[chosenIndex];
    const arcDegrees = 360 / remaining.length;
    const finalRotation = 360 * 7 - (chosenIndex + 0.5) * arcDegrees;
    const rotator = document.getElementById("wheel-rotator");
    const spinButton = document.getElementById("spin-wheel");
    const dialog = document.getElementById("wheel-dialog");
    const closeButton = document.querySelector(".wheel-close");
    const duration = 4400;

    spinButton.disabled = true;
    spinButton.textContent = "Sorteando...";
    closeButton.disabled = true;
    dialog.classList.add("is-spinning");
    rotator.classList.add("is-spinning");
    startCandidateTicker(remaining, duration);

    if (typeof rotator.animate === "function") {
      wheelAnimation = rotator.animate(
        [
          { transform: "rotate(0deg)" },
          { transform: `rotate(${finalRotation}deg)` }
        ],
        {
          duration,
          easing: "cubic-bezier(0.12, 0.68, 0.08, 1)",
          fill: "forwards"
        }
      );
    } else {
      window.requestAnimationFrame(() => {
        rotator.style.transform = `rotate(${finalRotation}deg)`;
      });
    }

    window.setTimeout(() => {
      finishCandidateTicker(chosen);
      dialog.classList.remove("is-spinning");
      closeButton.disabled = false;
      spinButton.textContent = "Sorteado!";
      const winner = document.getElementById("wheel-winner");
      winner.hidden = false;
      winner.innerHTML = `
        <span>Equipe sorteada</span>
        <img src="${escapeAttribute(chosen.logo)}" alt="" />
        <strong>${escapeHtml(chosen.name)}</strong>
      `;
      state.spinning = false;
      placeTeam(chosen, "roleta");
      closeWheelTimer = window.setTimeout(() => {
        document.getElementById("wheel-dialog").close();
        scheduleAutomaticLastTeam();
      }, 1500);
    }, duration);
  }

  function startCandidateTicker(teams, duration) {
    const candidates = Array.from(document.querySelectorAll(".wheel-candidate"));
    const status = document.getElementById("wheel-live-status");
    const label = document.getElementById("wheel-live-label");
    const name = document.getElementById("wheel-live-name");
    const startedAt = performance.now();
    let index = 0;

    window.clearTimeout(candidateTickerTimer);
    status.classList.remove("is-result");
    status.classList.add("is-spinning");
    label.textContent = "Sorteando equipe";

    const tick = () => {
      if (!state.spinning) return;
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const team = teams[index % teams.length];

      candidates.forEach((candidate) => candidate.classList.remove("is-active"));
      const active = candidates.find((candidate) => candidate.dataset.teamId === team.id);
      if (active) active.classList.add("is-active");
      name.textContent = team.name;

      index += 1;
      const delay = 70 + Math.round(Math.pow(progress, 2.4) * 300);
      candidateTickerTimer = window.setTimeout(tick, delay);
    };

    tick();
  }

  function finishCandidateTicker(chosen) {
    window.clearTimeout(candidateTickerTimer);
    document.querySelectorAll(".wheel-candidate").forEach((candidate) => {
      candidate.classList.remove("is-active");
      candidate.classList.toggle("is-selected", candidate.dataset.teamId === chosen.id);
    });
    const status = document.getElementById("wheel-live-status");
    status.classList.remove("is-spinning");
    status.classList.add("is-result");
    document.getElementById("wheel-live-label").textContent = "Equipe sorteada";
    document.getElementById("wheel-live-name").textContent = chosen.name;
  }

  function stopWheelEffects() {
    window.clearTimeout(candidateTickerTimer);
    if (wheelAnimation) {
      wheelAnimation.cancel();
      wheelAnimation = null;
    }
    const dialog = document.getElementById("wheel-dialog");
    if (dialog) dialog.classList.remove("is-spinning");
    document.querySelectorAll(".wheel-candidate").forEach((candidate) => {
      candidate.classList.remove("is-active", "is-selected");
    });
  }

  function placeTeam(entry, method) {
    const group = GROUPS[state.currentGroupIndex];
    const position = state.currentPot;
    state.groups[group][position - 1] = entry;
    state.drawnIds.add(entry.id);
    state.lastTeam = entry;
    state.history.push({
      order: state.history.length + 1,
      method,
      pot: state.currentPot,
      group,
      initialPosition: position,
      teamId: entry.id,
      team: entry.name,
      tag: entry.tag
    });

    state.notice = method === "automatic"
      ? `${entry.name} ocupou automaticamente a última vaga do Pote ${state.currentPot}, Grupo ${group}.`
      : `${entry.name} foi para o Grupo ${group}.`;

    if (state.currentGroupIndex < GROUPS.length - 1) {
      state.currentGroupIndex += 1;
    } else if (state.currentPot < POT_COUNT) {
      state.currentPot += 1;
      state.currentGroupIndex = 0;
    } else {
      state.finished = true;
      state.notice = "Todos os grupos foram preenchidos. Agora sorteie as posições internas.";
    }

    render();
  }

  function scheduleAutomaticLastTeam() {
    if (state.finished) return;
    const remaining = getRemainingTeams();
    if (remaining.length !== 1 || state.currentGroupIndex !== GROUPS.length - 1) return;

    state.autoPlacementPending = true;
    state.notice = `Última equipe do Pote ${state.currentPot}: preenchendo automaticamente o Grupo D...`;
    renderStage();

    autoPlacementTimer = window.setTimeout(() => {
      const finalTeam = getRemainingTeams()[0];
      if (finalTeam) placeTeam(finalTeam, "automatic");
      state.autoPlacementPending = false;
      render();
    }, 1400);
  }

  function getRemainingTeams() {
    return config.teams.filter((entry) => entry.pot === state.currentPot && !state.drawnIds.has(entry.id));
  }

  function shufflePositions() {
    if (!state.finished) return;
    GROUPS.forEach((group) => {
      state.groups[group] = fisherYates([...state.groups[group]]);
    });
    state.positionsShuffled = true;
    state.notice = "Posições sorteadas dentro de cada grupo. Os grupos foram mantidos.";
    document.getElementById("shuffle-positions").textContent = "Sortear novamente";
    renderGroups();
    renderStage();
  }

  function exportJson() {
    if (!state.finished) return;
    const groups = Object.fromEntries(GROUPS.map((group) => [
      group,
      state.groups[group].map((entry, index) => ({
        position: index + 1,
        slot: `${group}${index + 1}`,
        name: entry.name,
        tag: entry.tag,
        logo: entry.logo.replace(/^\.\.\//, ""),
        pot: entry.pot
      }))
    ]));
    const teamsBySlot = {};
    GROUPS.forEach((group) => {
      groups[group].forEach((entry) => {
        teamsBySlot[entry.slot] = {
          name: entry.name,
          tag: entry.tag,
          logo: entry.logo,
          pot: entry.pot
        };
      });
    });

    const payload = {
      schemaVersion: 1,
      competition: "Liga RK 26.2",
      division: divisionKey,
      divisionLabel: config.label,
      generatedAt: new Date().toISOString(),
      positionsRandomized: state.positionsShuffled,
      groups,
      teamsBySlot,
      drawHistory: state.history
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = config.exportName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.notice = "JSON gerado com a ordem atual dos grupos.";
    renderStage();
  }

  function resetDraw() {
    if (state.drawnIds.size && !window.confirm("Reiniciar todo o sorteio desta divisão?")) return;
    window.clearTimeout(autoPlacementTimer);
    window.clearTimeout(closeWheelTimer);
    stopWheelEffects();
    const clean = createState();
    Object.keys(clean).forEach((key) => {
      state[key] = clean[key];
    });
    const dialog = document.getElementById("wheel-dialog");
    if (dialog.open) dialog.close();
    document.getElementById("shuffle-positions").textContent = "Sortear posições";
    render();
  }

  function fisherYates(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const target = secureRandomIndex(index + 1);
      [items[index], items[target]] = [items[target], items[index]];
    }
    return items;
  }

  function secureRandomIndex(limit) {
    if (window.crypto && window.crypto.getRandomValues) {
      const range = Math.floor(0x100000000 / limit) * limit;
      const values = new Uint32Array(1);
      do {
        window.crypto.getRandomValues(values);
      } while (values[0] >= range);
      return values[0] % limit;
    }
    return Math.floor(Math.random() * limit);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
