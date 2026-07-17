(function () {
  const apiBase = (window.LIGA_RK_API_BASE || "https://liga-rk-api.suporteinhouserk.workers.dev").replace(/\/+$/, "");
  const champions = Array.isArray(window.LIGA_RK_CHAMPIONS) ? window.LIGA_RK_CHAMPIONS : [];
  const form = document.getElementById("pool-form");
  const status = document.getElementById("pool-status");
  const submitButton = form && form.querySelector(".pool-submit");
  const returnHome = document.getElementById("pool-return-home");
  const divisionLabels = { elite: "Divisão Elite", ascension: "Divisão Ascensão" };
  const state = { loaded: false, submitting: false, options: {} };

  if (!form) return;

  form.addEventListener("change", handlePreviewChange);
  form.addEventListener("submit", submitPrediction);
  loadOfficialContent();

  async function loadOfficialContent() {
    setSubmitting(true, "Carregando equipes e jogadores oficiais...");
    try {
      const response = await fetch(`${apiBase}/api/content?v=${Date.now()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const content = data.content && data.content.divisions ? data.content : data;
      if (!response.ok || !content || !content.divisions) {
        throw new Error(data.error || "Não foi possível carregar os dados oficiais.");
      }

      state.options.elite = optionsForDivision(content.divisions.elite);
      state.options.ascension = optionsForDivision(content.divisions.ascension);
      renderChampionPick("pool-champion-most-picked", "Campeão mais escolhido", "choices.champions.mostPicked");
      renderChampionPick("pool-champion-most-wins", "Campeão mais vitorioso", "choices.champions.mostWins");
      renderDivision("elite");
      renderDivision("ascension");
      state.loaded = true;
      setSubmitting(false, "");
    } catch (error) {
      setSubmitting(true, error.message || "Não foi possível abrir o Bolão agora.", true);
    }
  }

  function optionsForDivision(division) {
    const teams = [];
    const players = [];

    Object.entries(division && division.teams || {}).forEach(([slot, team]) => {
      const name = String(team && team.name || "").trim();
      const tag = String(team && team.tag || slot).trim().toUpperCase();
      if (!name || /vaga disponível|nome do time/i.test(name)) return;

      teams.push({
        id: slot,
        name,
        tag,
        label: `${name} (${tag})`,
        image: normalizeAssetPath(team.logo || "assets/logo_rk_placeholder.png")
      });

      (team.players || []).forEach((player, index) => {
        const playerName = String(player && (player.player || player.name) || "").trim();
        if (!playerName || /^(?:jogador|player|-|--|sub)$/i.test(playerName)) return;
        players.push({
          id: String(player.playerId || `${slot}:${index}`),
          name: playerName,
          tag,
          lane: String(player.lane || "SUB").toUpperCase(),
          label: `${playerName} (${tag})`,
          image: normalizeAssetPath(team.logo || "assets/logo_rk_placeholder.png")
        });
      });
    });

    teams.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    players.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { teams, players };
  }

  function renderChampionPick(targetId, title, fieldName) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = `
      <article class="pool-pick-card pool-champion-card">
        <h2>${escapeHtml(title)}</h2>
        ${renderSelect(fieldName, champions, "Escolha um campeão", "champion")}
        <div class="pool-pick-preview champion" data-preview-for="${escapeAttribute(fieldName)}">
          <img src="assets/logo_rk_placeholder.png" alt="Campeão ainda não escolhido" />
        </div>
      </article>
    `;
  }

  function renderDivision(key) {
    const target = document.getElementById(`pool-${key}-column`);
    const options = state.options[key] || { teams: [], players: [] };
    if (!target) return;

    target.innerHTML = `
      <h2 class="pool-division-title">${divisionLabels[key]}</h2>
      <article class="pool-pick-card pool-team-card">
        <h3>Equipe <span>campeã</span></h3>
        ${renderSelect(`choices.divisions.${key}.teamChampion`, options.teams, "Escolha uma equipe", "team")}
        <div class="pool-pick-preview team" data-preview-for="choices.divisions.${key}.teamChampion">
          <img src="assets/logo_rk_placeholder.png" alt="Equipe ainda não escolhida" />
        </div>
      </article>
      ${renderPlayerPick(key, "mvp", "MVP do campeonato")}
      ${renderPlayerPick(key, "bestKda", "Melhor KDA")}
      ${renderPlayerPick(key, "highestDpm", "Maior DPM", "DPM = dano por minuto")}
      ${renderPlayerPick(key, "highestGpm", "Maior GPM", "GPM = ouro por minuto")}
      ${renderPlayerPick(key, "highestKp", "Maior KP", "KP = participação em abates")}
      ${renderPlayerPick(key, "highestVision", "Melhor VIS", "VIS = visão por minuto")}
    `;
  }

  function renderPlayerPick(division, field, title, description = "") {
    const name = `choices.divisions.${division}.${field}`;
    return `
      <article class="pool-pick-card pool-player-card">
        <h3>${accentTitle(title, title.split(" ").pop())}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ""}
        ${renderSelect(name, state.options[division].players, "Escolha um jogador", "player")}
      </article>
    `;
  }

  function renderSelect(name, options, placeholder, type) {
    return `
      <label class="pool-select-shell">
        <span class="sr-only">${escapeHtml(placeholder)}</span>
        <select name="${escapeAttribute(name)}" data-preview-type="${escapeAttribute(type)}" required>
          <option value="">${escapeHtml(placeholder)}</option>
          ${options.map((option) => `
            <option value="${escapeAttribute(option.id)}" data-image="${escapeAttribute(option.image || "")}" data-label="${escapeAttribute(option.name || option.label)}">
              ${escapeHtml(option.label || option.name)}
            </option>
          `).join("")}
        </select>
      </label>
    `;
  }

  function handlePreviewChange(event) {
    const select = event.target.closest("select[data-preview-type]");
    if (!select) return;
    const preview = Array.from(form.querySelectorAll("[data-preview-for]"))
      .find((element) => element.dataset.previewFor === select.name);
    if (!preview) return;
    const option = select.options[select.selectedIndex];
    const image = option && option.dataset.image || "assets/logo_rk_placeholder.png";
    const label = option && option.dataset.label || "Escolha ainda não realizada";
    preview.innerHTML = `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(label)}" />`;
  }

  async function submitPrediction(event) {
    event.preventDefault();
    if (!state.loaded || state.submitting) return;
    if (!form.reportValidity()) {
      setStatus("Complete todos os campos e palpites antes de finalizar.", true);
      return;
    }

    const data = new FormData(form);
    const payload = {
      version: 1,
      communityNick: String(data.get("communityNick") || "").trim(),
      discordId: String(data.get("discordId") || "").trim(),
      choices: {
        champions: {
          mostPicked: data.get("choices.champions.mostPicked"),
          mostWins: data.get("choices.champions.mostWins")
        },
        divisions: {
          elite: divisionPayload(data, "elite"),
          ascension: divisionPayload(data, "ascension")
        }
      }
    };

    setSubmitting(true, "Enviando suas escolhas...");
    try {
      const response = await fetch(`${apiBase}/api/pool-predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `A API retornou ${response.status}.`);
      }

      form.querySelectorAll("input, select, button").forEach((element) => { element.disabled = true; });
      setStatus("Suas escolhas foram feitas! Vencedores e premiações serão divulgados mais tarde. Agora, resta torcer.");
      status.classList.add("success");
      status.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        if (submitButton) submitButton.hidden = true;
        if (returnHome) {
          returnHome.hidden = false;
          returnHome.focus({ preventScroll: true });
        }
      }, 3000);
    } catch (error) {
      setSubmitting(false, error.message || "Não foi possível enviar suas escolhas agora.", true);
    }
  }

  function divisionPayload(data, key) {
    return {
      teamChampion: data.get(`choices.divisions.${key}.teamChampion`),
      mvp: data.get(`choices.divisions.${key}.mvp`),
      bestKda: data.get(`choices.divisions.${key}.bestKda`),
      highestDpm: data.get(`choices.divisions.${key}.highestDpm`),
      highestGpm: data.get(`choices.divisions.${key}.highestGpm`),
      highestKp: data.get(`choices.divisions.${key}.highestKp`),
      highestVision: data.get(`choices.divisions.${key}.highestVision`)
    };
  }

  function setSubmitting(active, message, isError = false) {
    state.submitting = active;
    if (submitButton) {
      submitButton.disabled = active;
      submitButton.textContent = active ? "Aguarde..." : "Finalizar escolhas";
    }
    setStatus(message, isError);
  }

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
    if (!message) status.classList.remove("success");
  }

  function accentTitle(title, word) {
    const index = title.toLocaleLowerCase("pt-BR").lastIndexOf(String(word).toLocaleLowerCase("pt-BR"));
    if (index < 0) return escapeHtml(title);
    return `${escapeHtml(title.slice(0, index))}<span>${escapeHtml(title.slice(index))}</span>`;
  }

  function normalizeAssetPath(value) {
    return String(value || "").replace(/\\/g, "/");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
