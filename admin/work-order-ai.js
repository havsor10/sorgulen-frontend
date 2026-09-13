(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const QUESTION_KEY = "sorgulen_ai_questions_v1";
  const nativeFetch = window.fetch.bind(window);
  const money = (value) => new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const state = { orderId: "", imageData: "", proposal: null };

  function adminHeaders(extra = {}) {
    return { "Content-Type": "application/json", "x-admin-key": localStorage.getItem(KEY) || "", ...extra };
  }

  async function directApi(path, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await nativeFetch(`${API}${path}`, { ...options, signal: controller.signal, headers: adminHeaders(options.headers || {}) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw Object.assign(new Error(data?.error || `API-feil ${response.status}`), { status: response.status, data });
      return data;
    } finally { clearTimeout(timer); }
  }

  function parseJsonBody(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function requestInfo(input, init = {}) {
    if (!init.body || typeof init.body !== "string") return null;
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : "";
    if (!rawUrl || rawUrl.includes("/admin/work-order-ai/")) return null;
    const method = String(init.method || "GET").toUpperCase();
    if (!["POST", "PATCH"].includes(method)) return null;
    let url;
    try { url = new URL(rawUrl, location.origin); } catch { return null; }
    const payload = parseJsonBody(init.body);
    if (!payload || typeof payload !== "object") return null;
    const path = url.pathname;
    const work = path.match(/\/api\/admin\/work-orders\/([a-f0-9]{24})(?:\/([^/?]+))?/i);
    const ops = path.match(/\/api\/admin\/operations\/work-orders\/([a-f0-9]{24})\/([^/?]+)(?:\/([^/?]+))?/i);
    const orderId = work?.[1] || ops?.[1] || "";
    if (!orderId) return null;

    if (work && !work[2] && payload.notes !== undefined) return { orderId, field: "project.notes", key: "notes", entryId: "", payload };
    if (work?.[2] === "time-entries" && payload.comment !== undefined) return { orderId, field: "time.comment", key: "comment", entryId: payload.operationId || "", payload };
    if (work?.[2] === "expenses" && payload.description !== undefined) return { orderId, field: "expense.description", key: "description", entryId: payload.operationId || "", payload };
    if (work?.[2] === "materials" && payload.comment !== undefined && String(payload.comment || "").trim()) return { orderId, field: "material.comment", key: "comment", entryId: payload.operationId || "", payload };
    if (work?.[2] === "notes" && payload.text !== undefined) return { orderId, field: "note.text", key: "text", entryId: payload.operationId || "", payload };

    if (ops?.[2] === "time" && payload.description !== undefined) return { orderId, field: "time.comment", key: "description", entryId: ops[3] || payload.operationId || "", payload };
    if (ops?.[2] === "expenses" && payload.description !== undefined) return { orderId, field: "expense.description", key: "description", entryId: ops[3] || "", payload };
    if (ops?.[2] === "materials" && payload.comment !== undefined && String(payload.comment || "").trim()) return { orderId, field: "material.comment", key: "comment", entryId: ops[3] || "", payload };
    if (ops?.[2] === "notes" && payload.text !== undefined) return { orderId, field: "note.text", key: "text", entryId: ops[3] || "", payload };
    return null;
  }

  function loadQuestions() {
    try { return JSON.parse(localStorage.getItem(QUESTION_KEY) || "{}"); } catch { return {}; }
  }

  function saveQuestions(value) {
    try { localStorage.setItem(QUESTION_KEY, JSON.stringify(value)); } catch (_) {}
  }

  function addQuestions(orderId, field, entryId, questions) {
    if (!Array.isArray(questions) || !questions.length) return;
    const store = loadQuestions();
    const existing = Array.isArray(store[orderId]) ? store[orderId] : [];
    for (const item of questions) {
      const message = String(item?.message || "").trim();
      if (!message) continue;
      const key = `${field}|${entryId || ""}|${message}`;
      if (existing.some((question) => question.key === key)) continue;
      existing.push({ key, field, entryId: entryId || "", kind: item.kind || "other", message, createdAt: new Date().toISOString() });
    }
    store[orderId] = existing.slice(-20);
    saveQuestions(store);
    renderQuestionPanel();
  }

  function removeQuestion(orderId, key) {
    const store = loadQuestions();
    store[orderId] = (store[orderId] || []).filter((item) => item.key !== key);
    saveQuestions(store);
    renderQuestionPanel();
  }

  function toast(message) {
    let node = document.getElementById("workOrderAiToast");
    if (!node) {
      node = document.createElement("div");
      node.id = "workOrderAiToast";
      node.className = "work-ai-toast";
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove("show"), 2800);
  }

  async function reviewText(info) {
    const text = String(info.payload[info.key] || "").trim();
    if (!text || text.length < 3) return null;
    try {
      const result = await directApi(`/admin/work-order-ai/${encodeURIComponent(info.orderId)}/review-text`, {
        method: "POST",
        body: JSON.stringify({ field: info.field, text, entryId: info.entryId, values: info.payload }),
      }, 7000);
      if (Array.isArray(result.questions) && result.questions.length) addQuestions(info.orderId, info.field, info.entryId, result.questions);
      return result;
    } catch (_) { return null; }
  }

  window.fetch = async function aiAwareFetch(input, init = {}) {
    const info = requestInfo(input, init);
    if (!info) return nativeFetch(input, init);
    const result = await reviewText(info);
    if (!result?.correctedText || result.correctedText === info.payload[info.key]) return nativeFetch(input, init);
    const nextPayload = { ...info.payload, [info.key]: result.correctedText };
    toast("AI rettet skrivefeil automatisk.");
    return nativeFetch(input, { ...init, body: JSON.stringify(nextPayload) });
  };

  function currentWorkspace() {
    return document.querySelector("[data-field-workspace][data-order-id]");
  }

  function renderQuestionPanel() {
    const workspace = currentWorkspace();
    if (!workspace) return;
    const orderId = workspace.dataset.orderId;
    const questions = loadQuestions()[orderId] || [];
    let panel = workspace.querySelector("[data-work-ai-questions]");
    if (!questions.length) { panel?.remove(); return; }
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "work-ai-questions";
      panel.dataset.workAiQuestions = "";
      const readiness = workspace.querySelector("#fieldReadiness");
      (readiness?.parentNode || workspace).insertBefore(panel, readiness || workspace.firstChild);
    }
    panel.innerHTML = `<div class="work-ai-questions-head"><div><span>AI-kontroll</span><strong>${questions.length} ${questions.length === 1 ? "ting bør avklares" : "ting bør avklares"}</strong></div></div><div class="work-ai-question-list">${questions.map((item) => `<div class="work-ai-question" data-ai-question-key="${esc(item.key)}"><p>${esc(item.message)}</p><div><button type="button" class="secondary-btn" data-ai-question-fix>Ordne nå</button><button type="button" class="work-ai-link" data-ai-question-ignore>Ignorer</button></div></div>`).join("")}</div>`;
  }

  function focusQuestion(question) {
    if (!question) return;
    if (question.field === "project.notes") {
      const details = document.querySelector(".field-notes");
      if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "center" }); details.querySelector("textarea")?.focus(); return; }
    }
    if (state.orderId && window.SorgulenOperations?.openManager) window.SorgulenOperations.openManager(state.orderId);
  }

  function ensureAiButton() {
    const workspace = currentWorkspace();
    if (!workspace) return;
    state.orderId = workspace.dataset.orderId || "";
    const row = workspace.querySelector(".field-action-row");
    if (row && !row.querySelector("[data-work-ai-open]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "field-secondary-action work-ai-open";
      button.dataset.workAiOpen = "";
      button.textContent = "AI: bilde / skjermbilde";
      row.insertBefore(button, row.querySelector("[data-field-add-backdrop]") || null);
    }
    renderQuestionPanel();
  }

  function ensureModal() {
    let modal = document.getElementById("workOrderAiModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "workOrderAiModal";
    modal.className = "work-ai-modal";
    modal.hidden = true;
    modal.innerHTML = `<div class="work-ai-sheet" role="dialog" aria-modal="true" aria-labelledby="workAiTitle"><div class="work-ai-head"><div><span>AI-assistent</span><h2 id="workAiTitle">Les bilde / skjermbilde</h2></div><button type="button" class="admin-icon-button" data-work-ai-close aria-label="Lukk">×</button></div><div class="work-ai-body"><p class="work-ai-intro">Send prisoppsett, kvittering, faktura eller produktside. AI lager forslag først. Ingenting økonomisk føres før du godkjenner.</p><div class="work-ai-picker"><input id="workAiFile" type="file" accept="image/*" hidden><button type="button" class="secondary-btn" data-work-ai-pick>Velg bilde / skjermbilde</button><div id="workAiPreview" class="work-ai-preview">Ingen bilde valgt</div></div><p id="workAiError" class="error-text"></p><button type="button" id="workAiAnalyze" class="primary-btn" disabled>Analyser bilde</button><div id="workAiResult"></div></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => { if (event.target === modal || event.target.closest("[data-work-ai-close]")) closeAiModal(); });
    modal.querySelector("[data-work-ai-pick]").addEventListener("click", () => modal.querySelector("#workAiFile").click());
    modal.querySelector("#workAiFile").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const error = modal.querySelector("#workAiError");
      error.textContent = "";
      try {
        state.imageData = await imageToDataUri(file);
        modal.querySelector("#workAiPreview").innerHTML = `<img src="${esc(state.imageData)}" alt="Valgt bilde">`;
        modal.querySelector("#workAiAnalyze").disabled = false;
        modal.querySelector("#workAiResult").innerHTML = "";
      } catch (err) { error.textContent = err.message; }
    });
    modal.querySelector("#workAiAnalyze").addEventListener("click", analyzeImage);
    return modal;
  }

  function openAiModal() {
    const modal = ensureModal();
    state.imageData = "";
    state.proposal = null;
    modal.querySelector("#workAiFile").value = "";
    modal.querySelector("#workAiPreview").textContent = "Ingen bilde valgt";
    modal.querySelector("#workAiError").textContent = "";
    modal.querySelector("#workAiResult").innerHTML = "";
    modal.querySelector("#workAiAnalyze").disabled = true;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeAiModal() {
    const modal = document.getElementById("workOrderAiModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  async function imageToDataUri(file) {
    if (!file.type.startsWith("image/")) throw new Error("Velg et bilde eller skjermbilde.");
    const original = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Kunne ikke lese bildet."));
      reader.readAsDataURL(file);
    });
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = original; });
      const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.86);
    } catch {
      if (original.length > 13_000_000) throw new Error("Bildet er for stort. Velg et mindre bilde.");
      return original;
    }
  }

  function actionText(action) {
    if (action.type === "set_project_pricing") {
      const parts = [];
      if (action.pricingMode) parts.push(action.pricingMode === "fixed" ? "Fastpris" : action.pricingMode === "hybrid" ? "Fastpris + timer" : "Timespris");
      if (action.hourlyRate != null) parts.push(`${money(action.hourlyRate)} / time`);
      if (action.fixedPrice != null) parts.push(`fastpris ${money(action.fixedPrice)}`);
      return parts.join(" · ") || "Prisoppsett";
    }
    if (action.type === "add_expense") return `${action.description} · ${money(action.amount)}${action.supplier ? ` · ${action.supplier}` : ""}`;
    if (action.type === "add_material") {
      const prices = [action.purchaseUnitPrice != null ? `innkjøp ${money(action.purchaseUnitPrice)}` : "", action.customerUnitPrice != null ? `kunde ${money(action.customerUnitPrice)}` : "kundepris ikke angitt"].filter(Boolean).join(" · ");
      return `${action.item} · ${action.quantity} ${action.unit || "stk"} · ${prices}`;
    }
    return action.label || action.type;
  }

  function renderProposal(proposal) {
    const result = document.getElementById("workAiResult");
    const warnings = [...(proposal.warnings || []), ...(proposal.questions || [])];
    const actions = proposal.actions || [];
    result.innerHTML = `<section class="work-ai-result-card"><div class="work-ai-result-head"><span>${esc(proposal.documentType || "ukjent")}</span><strong>${esc(proposal.summary || "AI har lest bildet")}</strong></div>${warnings.length ? `<div class="work-ai-warnings">${warnings.map((text) => `<p>${esc(text)}</p>`).join("")}</div>` : ""}${actions.length ? `<form id="workAiApplyForm"><div class="work-ai-actions">${actions.map((action, index) => `<label class="work-ai-action"><input type="checkbox" name="action" value="${index}" checked><span><strong>${esc(action.label || (action.type === "set_project_pricing" ? "Prisoppsett" : action.type === "add_expense" ? "Utgift" : "Materiale"))}</strong><small>${esc(actionText(action))}</small>${action.evidence ? `<em>Fra bildet: ${esc(action.evidence)}</em>` : ""}${action.type === "add_expense" ? '<label class="work-ai-billable"><input type="checkbox" data-ai-billable> Ta utgiften med på kundens fakturagrunnlag</label>' : ""}</span></label>`).join("")}</div><p class="work-ai-confirm-note">Kontroller tallene. AI får ikkje gjette økonomi; bare valgte forslag blir ført.</p><button type="submit" class="primary-btn">Godkjenn valgte</button></form>` : '<p class="work-ai-empty">AI fant ingen opplysninger som er sikre nok til å føre automatisk. Bruk spørsmålene over eller registrer manuelt.</p>'}</section>`;
    result.querySelector("#workAiApplyForm")?.addEventListener("submit", applyProposal);
  }

  async function analyzeImage() {
    if (!state.orderId || !state.imageData) return;
    const button = document.getElementById("workAiAnalyze");
    const error = document.getElementById("workAiError");
    button.disabled = true;
    button.textContent = "AI leser bildet…";
    error.textContent = "";
    try {
      const data = await directApi(`/admin/work-order-ai/${encodeURIComponent(state.orderId)}/analyze-image`, { method: "POST", body: JSON.stringify({ imageData: state.imageData }) }, 25000);
      state.proposal = data.proposal;
      renderProposal(state.proposal);
    } catch (err) { error.textContent = err.name === "AbortError" ? "AI brukte for lang tid. Prøv igjen." : err.message; }
    finally { button.disabled = false; button.textContent = "Analyser bilde"; }
  }

  async function normalWrite(path, payload) {
    const response = await nativeFetch(`${API}${path}`, { method: "POST", headers: adminHeaders(), body: JSON.stringify(payload) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
    return data;
  }

  async function normalPatch(path, payload) {
    const response = await nativeFetch(`${API}${path}`, { method: "PATCH", headers: adminHeaders(), body: JSON.stringify(payload) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
    return data;
  }

  async function applyProposal(event) {
    event.preventDefault();
    if (!state.proposal || !state.orderId) return;
    const form = event.currentTarget;
    const selected = [...form.querySelectorAll('input[name="action"]:checked')].map((node) => Number(node.value));
    if (!selected.length) return;
    const save = form.querySelector('button[type="submit"]');
    const error = document.getElementById("workAiError");
    save.disabled = true;
    error.textContent = "";
    try {
      for (const index of selected) {
        const action = state.proposal.actions[index];
        if (!action) continue;
        if (action.type === "set_project_pricing") {
          const payload = {};
          if (action.pricingMode) payload.pricingMode = action.pricingMode;
          if (action.hourlyRate != null) payload.hourlyRate = action.hourlyRate;
          if (action.fixedPrice != null) payload.fixedPrice = action.fixedPrice;
          if (Object.keys(payload).length) await normalPatch(`/admin/work-orders/${encodeURIComponent(state.orderId)}`, payload);
        } else if (action.type === "add_expense") {
          const actionBox = form.querySelector(`input[name="action"][value="${index}"]`)?.closest(".work-ai-action");
          const billable = actionBox?.querySelector("[data-ai-billable]")?.checked === true;
          await normalWrite(`/admin/work-orders/${encodeURIComponent(state.orderId)}/expenses`, {
            operationId: globalThis.crypto?.randomUUID?.() || `ai-expense-${Date.now()}-${index}`,
            amount: action.amount,
            description: action.description,
            supplier: action.supplier || "",
            occurredAt: action.occurredAt ? `${action.occurredAt}T12:00:00.000Z` : new Date().toISOString(),
            billable,
            receiptImage: state.imageData,
          });
        } else if (action.type === "add_material") {
          await normalWrite(`/admin/work-orders/${encodeURIComponent(state.orderId)}/materials`, {
            operationId: globalThis.crypto?.randomUUID?.() || `ai-material-${Date.now()}-${index}`,
            item: action.item,
            quantity: action.quantity || 1,
            unit: action.unit || "stk",
            purchaseUnitPrice: action.purchaseUnitPrice == null ? null : action.purchaseUnitPrice,
            unitPrice: action.customerUnitPrice == null ? null : action.customerUnitPrice,
            comment: action.comment || action.evidence || "",
            billable: true,
          });
        }
      }
      toast("AI-forslagene er ført på oppdraget.");
      closeAiModal();
      location.reload();
    } catch (err) { error.textContent = err.message; save.disabled = false; }
  }

  document.addEventListener("click", (event) => {
    const open = event.target.closest("[data-work-ai-open]");
    if (open) { event.preventDefault(); openAiModal(); return; }
    const fix = event.target.closest("[data-ai-question-fix]");
    const ignore = event.target.closest("[data-ai-question-ignore]");
    if (fix || ignore) {
      const row = event.target.closest("[data-ai-question-key]");
      const key = row?.dataset.aiQuestionKey || "";
      const questions = loadQuestions()[state.orderId] || [];
      const question = questions.find((item) => item.key === key);
      if (ignore) removeQuestion(state.orderId, key);
      else focusQuestion(question);
    }
  });

  const observer = new MutationObserver(() => window.setTimeout(ensureAiButton, 0));
  const target = document.getElementById("detailModalContent") || document.body;
  observer.observe(target, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureAiButton, { once: true });
  else ensureAiButton();
})();
