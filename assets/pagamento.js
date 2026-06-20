(function () {
  const paymentRoot = document.getElementById("payment-content");
  const payments = {
    elite: {
      label: "Divisão Elite",
      shortLabel: "Elite",
      amount: "R$ 100,00",
      qr: "assets/payment/qr_elite.png",
      pix:
        "00020126580014BR.GOV.BCB.PIX01360470fc0d-e885-4e6a-a7f8-6ee79422f54d5204000053039865406100.005802BR5918Vitor Lemos Caland6009SAO PAULO62140510WvNAauUBj363043B05"
    },
    ascensao: {
      label: "Divisão Ascensão",
      shortLabel: "Ascensão",
      amount: "R$ 75,00",
      qr: "assets/payment/qr_ascensao.png",
      pix:
        "00020126580014BR.GOV.BCB.PIX01360470fc0d-e885-4e6a-a7f8-6ee79422f54d520400005303986540575.005802BR5918Vitor Lemos Caland6009SAO PAULO62140510VlviJFjOeM63045FF4"
    }
  };

  if (!paymentRoot) {
    return;
  }

  const division = normalizeDivision(new URLSearchParams(window.location.search).get("divisao"));
  const payment = payments[division];

  if (!payment) {
    paymentRoot.innerHTML = `
      <article class="payment-card payment-card-empty">
        <h2>Escolha uma divisão</h2>
        <p>Não encontrei a divisão da inscrição. Volte ao formulário e finalize novamente para abrir o QR code correto.</p>
        <div class="payment-actions">
          <a class="division-link registration" href="inscricao.html">Voltar para inscrição</a>
          <a class="division-link" href="index.html">Voltar ao início</a>
        </div>
      </article>
    `;
    return;
  }

  document.title = `Pagamento ${payment.shortLabel} | LIGA RK 26.2`;
  paymentRoot.innerHTML = `
    <article class="payment-card payment-card-${division}">
      <header class="payment-card-header">
        <div>
          <span>Taxa de inscrição</span>
          <h2>${escapeHtml(payment.label)}</h2>
        </div>
        <strong>${escapeHtml(payment.amount)}</strong>
      </header>

      <div class="payment-grid">
        <figure class="payment-qr">
          <img src="${escapeAttribute(payment.qr)}" alt="QR code Pix para pagamento da ${escapeAttribute(payment.label)}" />
          <figcaption>QR code Pix da ${escapeHtml(payment.label)}</figcaption>
        </figure>

        <div class="payment-details">
          <dl class="payment-summary">
            <div>
              <dt>Recebedor</dt>
              <dd>Vitor Lemos Caland</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>${escapeHtml(payment.amount)} por time</dd>
            </div>
            <div>
              <dt>Divisão</dt>
              <dd>${escapeHtml(payment.label)}</dd>
            </div>
          </dl>

          <label class="payment-copy-field">
            <span>Pix copia e cola</span>
            <textarea readonly rows="5">${escapeHtml(payment.pix)}</textarea>
          </label>

          <div class="payment-actions">
            <button type="button" data-copy-pix>Copiar código Pix</button>
            <a href="${escapeAttribute(payment.qr)}" download>Salvar QR code</a>
          </div>

          <p class="payment-note">
            Caso não consiga concluir o pagamento agora, salve o código Pix ou o QR code para pagar até 24 de julho,
            às 23:59, ou contate o administrador da liga.
          </p>
        </div>
      </div>

      <footer class="payment-confirmation">
        <strong>Inscrição enviada com sucesso.</strong>
        <span>Aguarde a organização confirmar o pagamento e validar sua inscrição na página oficial da sua divisão.</span>
        <a class="division-link registration" href="index.html">Voltar ao início</a>
      </footer>
    </article>
  `;

  const copyButton = paymentRoot.querySelector("[data-copy-pix]");
  const pixField = paymentRoot.querySelector("textarea");

  if (copyButton && pixField) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(payment.pix);
        copyButton.textContent = "Código copiado";
      } catch (error) {
        pixField.focus();
        pixField.select();
        copyButton.textContent = "Selecione e copie";
      }

      window.setTimeout(() => {
        copyButton.textContent = "Copiar código Pix";
      }, 2400);
    });
  }

  function normalizeDivision(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "elite") {
      return "elite";
    }
    if (["ascensao", "ascensão", "ascension"].includes(normalized)) {
      return "ascensao";
    }
    return "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
