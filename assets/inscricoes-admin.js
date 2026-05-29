(function () {
  const defaultApiBase = "https://liga-rk-api.suporteinhouserk.workers.dev";
  const app = document.getElementById("registrations-admin-app");
  const state = {
    apiBase: localStorage.getItem("liga-rk-editor-api-base") || defaultApiBase,
    adminToken: localStorage.getItem("liga-rk-editor-admin-token") || "",
    registrations: [],
    status: ""
  };

  if (!app) {
    return;
  }

  render();

  app.addEventListener("input", (event) => {
    if (event.target.dataset.config === "apiBase") {
      state.apiBase = event.target.value.trim();
      localStorage.setItem("liga-rk-editor-api-base", state.apiBase);
    }
    if (event.target.dataset.config === "adminToken") {
      state.adminToken = event.target.value.trim();
      localStorage.setItem("liga-rk-editor-admin-token", state.adminToken);
    }
  });

  app.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) {
      return;
    }
    if (action.dataset.action === "load") {
      loadRegistrations();
    }
    if (action.dataset.action === "copy") {
      const id = Number(action.dataset.id);
      const registration = state.registrations.find((item) => item.id === id);
      if (registration) {
        navigator.clipboard.writeText(JSON.stringify(registration.payload || registration, null, 2));
        setStatus("JSON da inscrição copiado.");
      }
    }
  });

  async function loadRegistrations() {
    const apiBase = state.apiBase.replace(/\/+$/, "");
    const token = state.adminToken.trim();

    if (!apiBase) {
      setStatus("Informe a URL da API.", true);
      return;
    }
    if (!token) {
      setStatus("Informe o token de administrador.", true);
      return;
    }

    setStatus("Carregando inscrições...");

    try {
      const response = await fetch(`${apiBase}/api/admin/registrations?limit=300`, {
        headers: { "Authorization": `Bearer ${token}` },
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `API retornou ${response.status}.`);
      }

      state.registrations = data.registrations || [];
      setStatus(`${state.registrations.length} inscrição(ões) carregada(s).`);
      render();
    } catch (error) {
      setStatus(error.message || "Não consegui carregar as inscrições.", true);
    }
  }

  function render() {
    app.innerHTML = `
      <header class="editor-header">
        <a class="brand" href="index.html">
          <img class="brand-logo logo-white" src="assets/logo_liga_rk_nobg_512.png" alt="LIGA RK 26.2" />
          <span>Inscrições LIGA RK 26.2</span>
        </a>
        <div class="editor-actions">
          <button type="button" data-action="load">Carregar inscrições</button>
        </div>
      </header>

      <main class="editor-shell registrations-admin-shell">
        <section class="editor-intro">
          <h1>Painel de inscrições</h1>
          <p>Visualização privada das inscrições salvas no D1. Cole o mesmo token de administrador usado no editor.</p>
          <div class="editor-grid-2 editor-config-grid">
            <label class="editor-field">
              <span>API da Liga RK</span>
              <input data-config="apiBase" value="${escapeAttribute(state.apiBase)}" />
            </label>
            <label class="editor-field">
              <span>Token de administrador</span>
              <input data-config="adminToken" type="password" value="${escapeAttribute(state.adminToken)}" autocomplete="off" />
            </label>
          </div>
          <p class="editor-status ${state.statusError ? "error" : ""}" id="registrations-admin-status">${escapeHtml(state.status)}</p>
        </section>

        <section class="registrations-list">
          ${renderDivisionGroup("elite")}
          ${renderDivisionGroup("ascension")}
        </section>
      </main>
    `;
  }

  function renderEmptyState() {
    return `
      <article class="empty-dashboard">
        Nenhuma inscrição carregada ainda.
      </article>
    `;
  }

  function renderDivisionGroup(divisionKey) {
    const items = state.registrations.filter((registration) => registrationDivision(registration) === divisionKey);
    const title = divisionKey === "elite" ? "Divisão Elite" : "Divisão Ascensão";
    const modifier = divisionKey === "elite" ? "elite" : "ascension";

    return `
      <section class="registration-admin-group ${modifier}">
        <header class="registration-admin-group-header">
          <h2>${escapeHtml(title)} <span>${items.length}</span></h2>
        </header>
        <div class="registration-admin-group-list">
          ${items.length ? items.map(renderRegistrationCard).join("") : renderEmptyState()}
        </div>
      </section>
    `;
  }

  function renderRegistrationCard(registration) {
    const payload = registration.payload || {};
    const team = payload.team || {};
    const players = Array.isArray(payload.players) ? payload.players.filter(isPlayerFilled) : [];
    const division = divisionLabel(payload.division || registration.division);
    const logo = team.logoDataUrl || "";
    const submittedAt = formatDate(registration.submittedAt);
    const logoName = `${slug(team.tag || registration.teamTag || "time")}-logo.png`;

    return `
      <article class="registration-admin-card">
        <header>
          <div>
            <span>#${escapeHtml(registration.id || "")} - ${escapeHtml(submittedAt)}</span>
            <strong>${escapeHtml(team.name || registration.teamName || "Equipe sem nome")}</strong>
            <small>${escapeHtml(division)} · TAG ${escapeHtml(team.tag || registration.teamTag || "-")}</small>
          </div>
          <div class="registration-admin-logo">
            ${logo ? `<img src="${escapeAttribute(logo)}" alt="Logo de ${escapeAttribute(team.name || "equipe")}" />` : `<span>Sem logo</span>`}
            ${logo ? `<a href="${escapeAttribute(logo)}" download="${escapeAttribute(logoName)}">Baixar logo</a>` : ""}
          </div>
        </header>

        <div class="registration-admin-meta">
          <div><span>Divisão</span><strong>${escapeHtml(division)}</strong></div>
          <div><span>Equipe</span><strong>${escapeHtml(team.name || "-")}</strong></div>
          <div><span>TAG</span><strong>${escapeHtml(team.tag || "-")}</strong></div>
          <div><span>Capitão</span><strong>${escapeHtml(captainName(players))}</strong></div>
        </div>

        <div class="registration-admin-table-wrap">
          <table class="registration-admin-table">
            <thead>
              <tr>
                <th>Lane</th>
                <th>Nome</th>
                <th>Nick#tag</th>
                <th>Discord</th>
                <th>OP.GG</th>
                <th>Capitão</th>
              </tr>
            </thead>
            <tbody>
              ${players.map(renderPlayerRow).join("")}
            </tbody>
          </table>
        </div>

        <footer class="registration-admin-actions">
          <button type="button" data-action="copy" data-id="${escapeAttribute(registration.id)}">Copiar JSON</button>
        </footer>
      </article>
    `;
  }

  function renderPlayerRow(player) {
    return `
      <tr>
        <td>${escapeHtml(player.roleLabel || player.lane || "-")}</td>
        <td>${escapeHtml(player.name || "-")}</td>
        <td>${escapeHtml(player.riotId || "-")}</td>
        <td>${escapeHtml(player.discord || "-")}</td>
        <td>${player.opgg ? `<a href="${escapeAttribute(player.opgg)}" target="_blank" rel="noreferrer">Abrir</a>` : "-"}</td>
        <td>${player.captain ? "Sim" : ""}</td>
      </tr>
    `;
  }

  function captainName(players) {
    const captain = players.find((player) => player.captain);
    return captain ? captain.name : "-";
  }

  function isPlayerFilled(player) {
    return player && (player.name || player.riotId || player.discord || player.opgg);
  }

  function registrationDivision(registration) {
    const payload = registration.payload || {};
    return payload.division || registration.division || "";
  }

  function divisionLabel(value) {
    return value === "elite" ? "Divisão Elite" : "Divisão Ascensão";
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function setStatus(message, isError = false) {
    state.status = message;
    state.statusError = isError;
    const status = document.getElementById("registrations-admin-status");
    if (status) {
      status.textContent = message;
      status.classList.toggle("error", Boolean(isError));
    }
  }

  function slug(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "time";
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
})();
