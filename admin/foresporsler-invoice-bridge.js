(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const reqList = document.getElementById("reqList");
  const statusMessage = document.getElementById("statusMessage");
  if (!reqList) return;

  function getAdminKey() {
    return String(localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  function headers() {
    return { "Content-Type": "application/json", "x-admin-key": getAdminKey() };
  }

  function setMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message || "";
    statusMessage.className = `status-message ${type}`;
  }

  function markCentralInvoiceButtons(root = reqList) {
    root.querySelectorAll('button[data-action="invoice"]').forEach((button) => {
      button.textContent = "🧾 Åpne / lag faktura";
      button.title = "Opprett eller åpne faktura i det sentrale fakturasystemet";
    });
  }

  async function openCentralInvoice(requestId) {
    setMessage("Åpner faktura…");
    const response = await fetch(`${API_BASE}/requests/${encodeURIComponent(requestId)}/invoice`, {
      method: "POST",
      headers: headers(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kunne ikke åpne faktura");
    const invoice = data.invoice;
    if (!invoice?._id) throw new Error("Fakturaen mangler dokument-ID");
    window.location.href = `faktura-detalj.html?id=${encodeURIComponent(invoice._id)}`;
  }

  // Capture brukes med vilje: den gamle forespørselssiden får ikke starte sin
  // tidligere innebygde fakturaflyt. Nye fakturaer går alltid via Invoice.
  reqList.addEventListener("click", async (event) => {
    const button = event.target.closest('button[data-action="invoice"]');
    if (!button) return;
    const card = button.closest(".req-card");
    const requestId = card?.dataset?.id;
    if (!requestId) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    try {
      await openCentralInvoice(requestId);
    } catch (error) {
      button.disabled = false;
      setMessage(error.message || "Kunne ikke åpne faktura", "error");
    }
  }, true);

  const observer = new MutationObserver(() => markCentralInvoiceButtons());
  observer.observe(reqList, { childList: true, subtree: true });
  markCentralInvoiceButtons();
})();
