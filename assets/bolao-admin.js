(function () {
  const defaultApiBase = "https://liga-rk-api.suporteinhouserk.workers.dev";
  const app = document.getElementById("pool-admin-app");
  const state = {
    apiBase: localStorage.getItem("liga-rk-editor-api-base") || defaultApiBase,
    adminToken: localStorage.getItem("liga-rk-editor-admin-token") || "",
    predictions: [],
    status: "Nenhuma resposta carregada ainda.",
    statusError: false
  };
  const divisionLabels = { elite: "Elite", ascension: "Ascensão" };
  const questions = [
    { path: "choices.champions.mostPicked", label: "Campeão mais escolhido", group: "Geral" },
    { path: "choices.champions.mostWins", label: "Campeão mais vitorioso", group: "Geral" },
    ...["elite", "ascension"].flatMap((division) => [
      { path: `choices.divisions.${division}.teamChampion`, label: "Equipe campeã", group: divisionLabels[division] },
      { path: `choices.divisions.${division}.mvp`, label: "MVP do campeonato", group: divisionLabels[division] },
      { path: `choices.divisions.${division}.bestKda`, label: "Melhor KDA", group: divisionLabels[division] },
      { path: `choices.divisions.${division}.highestDpm`, label: "Maior DPM", group: divisionLabels[division] },
      { path: `choices.divisions.${division}.highestGpm`, label: "Maior GPM", group: divisionLabels[division] },
      { path: `choices.divisions.${division}.highestKp`, label: "Maior KP", group: divisionLabels[division] },
      { path: `choices.divisions.${division}.highestVision`, label: "Melhor VIS", group: divisionLabels[division] }
    ])
  ];

  if (!app) return;
  render();
  app.addEventListener("input", handleInput);
  app.addEventListener("click", handleClick);

  function handleInput(event) {
    if (event.target.dataset.config === "apiBase") {
      state.apiBase = event.target.value.trim();
      localStorage.setItem("liga-rk-editor-api-base", state.apiBase);
    }
    if (event.target.dataset.config === "adminToken") {
      state.adminToken = event.target.value.trim();
      localStorage.setItem("liga-rk-editor-admin-token", state.adminToken);
    }
  }

  function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "load") loadPredictions();
    if (button.dataset.action === "copy") {
      const entry = state.predictions.find((item) => String(item.id) === button.dataset.id);
      if (entry) navigator.clipboard.writeText(JSON.stringify(entry.payload || entry, null, 2));
      setStatus("Resposta copiada como JSON.");
    }
  }

  async function loadPredictions() {
    const apiBase = state.apiBase.replace(/\/+$/, "");
    if (!apiBase || !state.adminToken) {
      setStatus("Informe a API e o token de administrador.", true);
      return;
    }
    setStatus("Carregando respostas...");

    try {
      const response = await fetch(`${apiBase}/api/admin/pool-predictions?limit=1000`, {
        headers: { Authorization: `Bearer ${state.adminToken}` },
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("Token de administrador inválido.");
        if (response.status === 404) throw new Error("Atualize e implante o Worker para habilitar o painel do Bolão.");
        throw new Error(data.error || `A API retornou ${response.status}.`);
      }
      state.predictions = data.predictions || [];
      setStatus(`${state.predictions.length} resposta(s) carregada(s).`);
    } catch (error) {
      setStatus(error.message || "Não consegui carregar as respostas.", true);
    }
  }

  function render() {
    app.innerHTML = `
      <header class="editor-header">
        <a class="brand" href="index.html">
          <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="LIGA RK 26.2" />
          <span>Painel do Bolão</span>
        </a>
        <div class="editor-actions"><button type="button" data-action="load">Carregar respostas</button></div>
      </header>
      <main class="editor-shell pool-admin-shell">
        <section class="editor-intro">
          <h1>Bolão Oficial</h1>
          <p>Visualização privada e consolidada dos palpites armazenados na tabela própria do D1.</p>
          <div class="editor-grid-2 editor-config-grid">
            <label class="editor-field"><span>API da Liga RK</span><input data-config="apiBase" value="${escapeAttribute(state.apiBase)}" /></label>
            <label class="editor-field"><span>Token de administrador</span><input data-config="adminToken" type="password" value="${escapeAttribute(state.adminToken)}" autocomplete="off" /></label>
          </div>
          <p class="editor-status ${state.statusError ? "error" : ""}" id="pool-admin-status">${escapeHtml(state.status)}</p>
        </section>
        ${renderSummary()}
        ${renderEntries()}
      </main>
    `;
  }

  function renderSummary() {
    if (!state.predictions.length) return "";
    const groups = ["Geral", "Elite", "Ascensão"];
    return `
      <section class="pool-admin-summary">
        <header><p class="kicker">${state.predictions.length} participantes</p><h2>Respostas consolidadas</h2></header>
        <div class="pool-admin-summary-columns">
          ${groups.map((group) => `
            <div class="pool-admin-summary-group ${group === "Elite" ? "elite" : group === "Ascensão" ? "ascension" : "general"}">
              <h3>${escapeHtml(group)}</h3>
              ${questions.filter((question) => question.group === group).map(renderQuestionSummary).join("")}
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderQuestionSummary(question) {
    const counts = new Map();
    state.predictions.forEach((entry) => {
      const value = readPath(entry.payload || {}, question.path);
      if (!value) return;
      const id = String(value.id || value.label || value.name || value.player || value);
      const label = value.label || value.name || value.player || id;
      const current = counts.get(id) || { label, count: 0, image: value.logo || value.teamLogo || value.image || "" };
      current.count += 1;
      counts.set(id, current);
    });
    const rows = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
    return `
      <article class="pool-admin-question">
        <h4>${escapeHtml(question.label)}</h4>
        ${rows.length ? rows.map((row, index) => `
          <div class="pool-admin-result-row">
            <span>${index + 1}</span>
            ${row.image ? `<img src="${escapeAttribute(normalizeAssetPath(row.image))}" alt="" />` : ""}
            <strong>${escapeHtml(row.label)}</strong>
            <b>${row.count}</b>
          </div>
        `).join("") : "<p>Sem respostas.</p>"}
      </article>
    `;
  }

  function renderEntries() {
    if (!state.predictions.length) return "";
    return `
      <section class="pool-admin-entries">
        <header><p class="kicker">Auditoria</p><h2>Respostas individuais</h2></header>
        <div class="pool-admin-entry-list">
          ${state.predictions.map((entry) => `
            <details class="pool-admin-entry">
              <summary>
                <span>#${escapeHtml(entry.id)} · ${escapeHtml(formatDate(entry.submittedAt))}</span>
                <strong>${escapeHtml(entry.communityNick || "Participante")}</strong>
                <small>${escapeHtml(entry.discordId || "")}</small>
              </summary>
              <div class="pool-admin-entry-grid">
                ${questions.map((question) => {
                  const value = readPath(entry.payload || {}, question.path);
                  return `<div><span>${escapeHtml(`${question.group} · ${question.label}`)}</span><strong>${escapeHtml(answerLabel(value))}</strong></div>`;
                }).join("")}
              </div>
              <button type="button" data-action="copy" data-id="${escapeAttribute(entry.id)}">Copiar JSON</button>
            </details>
          `).join("")}
        </div>
      </section>
    `;
  }

  function setStatus(message, isError = false) {
    state.status = message;
    state.statusError = isError;
    render();
  }

  function readPath(target, path) {
    return path.split(".").reduce((value, key) => value && value[key], target);
  }

  function answerLabel(value) {
    if (!value) return "-";
    return value.label || value.name || value.player || value.id || String(value);
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
  }

  function normalizeAssetPath(value) {
    return String(value || "").replace(/\\/g, "/");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
