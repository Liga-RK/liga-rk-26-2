(function () {
  const apiBase = (window.LIGA_RK_API_BASE || "https://liga-rk-api.suporteinhouserk.workers.dev").replace(/\/+$/, "");
  const form = document.getElementById("registration-form");
  const playersRoot = document.getElementById("registration-players");
  const logoInput = document.getElementById("team-logo");
  const logoPreview = document.getElementById("logo-preview");
  const status = document.getElementById("registration-status");
  const submitButton = form && form.querySelector(".registration-submit");
  const lanes = [
    { id: "TOP", label: "TOP", icon: "assets/lane-icons/top-white.png" },
    { id: "JG", label: "JG", icon: "assets/lane-icons/jg-white.png" },
    { id: "MID", label: "MID", icon: "assets/lane-icons/mid-white.png" },
    { id: "ADC", label: "ADC", icon: "assets/lane-icons/adc-white.png" },
    { id: "SUP", label: "SUP", icon: "assets/lane-icons/sup-white.png" },
    { id: "SUB", label: "SUB" },
    { id: "SUB", label: "SUB" },
    { id: "SUB", label: "SUB" }
  ];
  let logoDataUrl = "";

  if (!form || !playersRoot) {
    return;
  }

  renderPlayerRows();

  form.addEventListener("submit", submitRegistration);
  form.addEventListener("input", handleInput);
  if (logoInput) {
    logoInput.addEventListener("change", handleLogoUpload);
  }

  function renderPlayerRows() {
    playersRoot.innerHTML = lanes
      .map((lane, index) => {
        const laneIcon = lane.icon
          ? `<img class="lane-icon lane-image" src="${lane.icon}" alt="${lane.label}" />`
          : `<span class="lane-icon lane-sub" aria-label="SUB"></span>`;
        return `
          <div class="registration-player-row" data-player-row="${index}">
            <div class="registration-player-lane">
              ${laneIcon}
              <span>${lane.label}</span>
            </div>
            <label>
              <span>Nome</span>
              <input name="playerName${index}" type="text" maxlength="32" autocomplete="off" />
            </label>
            <label>
              <span>Nick#tag</span>
              <input name="riotId${index}" type="text" maxlength="48" autocomplete="off" />
            </label>
            <label>
              <span>Discord</span>
              <input name="discord${index}" type="text" maxlength="48" autocomplete="off" />
            </label>
            <label>
              <span>OP.GG</span>
              <input name="opgg${index}" type="url" maxlength="220" placeholder="https://www.op.gg/..." />
            </label>
            <label class="captain-pick">
              <input name="captain" type="radio" value="${index}" />
              <span>Capitão</span>
            </label>
          </div>
        `;
      })
      .join("");
  }

  function handleInput(event) {
    if (event.target.name === "teamTag") {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    }
  }

  async function handleLogoUpload(event) {
    const file = event.target.files && event.target.files[0];
    logoDataUrl = "";

    if (!file) {
      updateLogoPreview("");
      return;
    }

    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setStatus("Envie uma imagem PNG, JPG ou WEBP.", true);
      logoInput.value = "";
      updateLogoPreview("");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setStatus("A logo está muito grande. Use uma imagem de até 8 MB.", true);
      logoInput.value = "";
      updateLogoPreview("");
      return;
    }

    try {
      logoDataUrl = await resizeImage(file, 512);
      updateLogoPreview(logoDataUrl);
      setStatus("");
    } catch (error) {
      setStatus("Não consegui carregar essa logo. Tente outro arquivo.", true);
      logoInput.value = "";
      updateLogoPreview("");
    }
  }

  function updateLogoPreview(src) {
    if (!logoPreview) {
      return;
    }
    logoPreview.innerHTML = src
      ? `<img src="${src}" alt="Preview da logo do time" />`
      : "Enviar logo";
  }

  async function submitRegistration(event) {
    event.preventDefault();
    const payload = collectPayload();
    const errors = validatePayload(payload);

    if (errors.length) {
      setStatus(errors[0], true);
      return;
    }

    setSubmitting(true);
    setStatus("Enviando inscrição...");

    try {
      const response = await fetch(`${apiBase}/api/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `API retornou ${response.status}.`);
      }

      form.reset();
      logoDataUrl = "";
      updateLogoPreview("");
      setStatus("Inscrição enviada. Abrindo pagamento...");
      const paymentDivision = payload.division === "elite" ? "elite" : "ascensao";
      window.location.assign(`pagamento.html?divisao=${paymentDivision}`);
    } catch (error) {
      setStatus(error.message || "Não foi possível enviar a inscrição agora.", true);
    } finally {
      setSubmitting(false);
    }
  }

  function collectPayload() {
    const data = new FormData(form);
    const captainIndex = data.get("captain") === null ? null : Number(data.get("captain"));
    const players = lanes.map((lane, index) => ({
      lane: lane.id,
      roleLabel: lane.label,
      name: clean(data.get(`playerName${index}`)),
      riotId: clean(data.get(`riotId${index}`)),
      discord: clean(data.get(`discord${index}`)),
      opgg: clean(data.get(`opgg${index}`)),
      captain: captainIndex === index
    }));

    return {
      division: clean(data.get("division")),
      team: {
        name: clean(data.get("teamName")),
        tag: clean(data.get("teamTag")).toUpperCase(),
        logoDataUrl
      },
      players,
      captainIndex,
      acceptedRules: data.get("acceptedRules") === "on",
      editDeadline: "2026-07-24T23:59:00-03:00",
      submittedPage: "inscricao.html"
    };
  }

  function validatePayload(payload) {
    const errors = [];
    const filledPlayers = payload.players.filter(isPlayerFilled);
    const requiredPlayers = payload.players.slice(0, 5);

    if (!["elite", "ascension"].includes(payload.division)) {
      errors.push("Escolha a divisão da equipe.");
    }
    if (!payload.team.name) {
      errors.push("Informe o nome do time.");
    }
    if (!/^[A-Z0-9]{2,4}$/.test(payload.team.tag)) {
      errors.push("A TAG deve ter de 2 a 4 caracteres, usando letras ou números.");
    }
    if (!payload.team.logoDataUrl) {
      errors.push("Envie a logo do time.");
    }
    if (filledPlayers.length < 5 || requiredPlayers.some((player) => !isPlayerComplete(player))) {
      errors.push("Preencha todos os dados dos 5 titulares.");
    }

    const incomplete = payload.players.some((player) => isPlayerFilled(player) && !isPlayerComplete(player));
    if (incomplete) {
      errors.push("Quando preencher um reserva, complete nome, nick#tag, Discord e OP.GG.");
    }
    if (payload.captainIndex === null || !isPlayerComplete(payload.players[payload.captainIndex])) {
      errors.push("Escolha um capitão entre os jogadores preenchidos.");
    }
    if (!payload.acceptedRules) {
      errors.push("Confirme que leu e concorda com o regulamento.");
    }

    return errors;
  }

  function isPlayerFilled(player) {
    return Boolean(player.name || player.riotId || player.discord || player.opgg);
  }

  function isPlayerComplete(player) {
    return Boolean(player && player.name && player.riotId && player.discord && player.opgg);
  }

  function resizeImage(file, size) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.width = size;
          canvas.height = size;
          context.clearRect(0, 0, size, size);

          const scale = Math.min(size / img.width, size / img.height);
          const width = Math.round(img.width * scale);
          const height = Math.round(img.height * scale);
          const x = Math.round((size - width) / 2);
          const y = Math.round((size - height) / 2);
          context.drawImage(img, x, y, width, height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function setSubmitting(isSubmitting) {
    if (submitButton) {
      submitButton.disabled = isSubmitting;
      submitButton.textContent = isSubmitting ? "Enviando..." : "Finalizar inscrição";
    }
  }

  function setStatus(message, isError = false) {
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function clean(value) {
    return String(value || "").trim();
  }
})();
