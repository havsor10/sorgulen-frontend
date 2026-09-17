(() => {
  "use strict";

  const shell = document.getElementById("adminShell");
  if (shell?.dataset.page !== "jobs" || !location.pathname.endsWith("/oppdrag.html")) return;

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const HISTORY_PREFIX = "sorgulen_work_order_ai_chat_v1:";
  const MAX_HISTORY = 16;
  let busy = false;
  let activeOrderId = "";

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function adminKey() {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  function storageKey(orderId) {
    return `${HISTORY_PREFIX}${orderId}`;
  }

  function loadHistory(orderId) {
    if (!orderId) return [];
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey(orderId)) || "[]");
      if (!Array.isArray(value)) return [];
      return value.slice(-MAX_HISTORY).filter((entry) => ["user", "assistant"].includes(entry?.role) && typeof entry?.content === "string");
    } catch (_) {
      return [];
    }
  }

  function saveHistory(orderId, history) {
    if (!orderId) return;
    try { sessionStorage.setItem(storageKey(orderId), JSON.stringify(history.slice(-MAX_HISTORY))); }
    catch (_) { /* samtalen er bare en bekvemmelighet */ }
  }

  function currentWorkspace() {
    return document.querySelector("[data-field-workspace][data-order-id]");
  }

  function chatRoot() {
    return currentWorkspace()?.querySelector("[data-work-order-chat]") || null;
  }

  function safeAdminHref(value) {
    const href = String(value || "").trim();
    return /^[a-z0-9._-]+\.html(?:\?[^\s]*)?$/i.test(href) ? href : "";
  }

  function orderLabel(workspace) {
    const customer = workspace.querySelector(".field-identity h2")?.textContent?.trim() || "Dette oppdraget";
    const service = workspace.querySelector(".field-service")?.textContent?.trim() || "";
    return service ? `${customer} · ${service}` : customer;
  }

  function createChat(workspace) {
    const orderId = workspace.dataset.orderId || "";
    if (!orderId) return null;
    activeOrderId = orderId;

    let root = workspace.querySelector("[data-work-order-chat]");
    if (root) return root;

    root = document.createElement("section");
    root.className = "work-order-chat";
    root.dataset.workOrderChat = "";
    root.dataset.orderId = orderId;
    root.innerHTML = `
      <div class="work-order-chat-head">
        <div>
          <span>AI · dette oppdraget</span>
          <strong>${esc(orderLabel(workspace))}</strong>
        </div>
        <button type="button" class="work-order-chat-new" data-project-ai-clear>Ny</button>
      </div>
      <p class="work-order-chat-scope">Denne samtalen følger bare dette kundeoppdraget. Bytter du oppdrag, bytter AI samtale og kontekst.</p>
      <div class="work-order-chat-messages" data-project-ai-messages aria-live="polite"></div>
      <div class="work-order-chat-suggestions" data-project-ai-suggestions>
        <button type="button" data-project-ai-prompt="Oppsummer dette oppdraget kort. Ka er gjort, ka mangler og ka er neste steg?">Oppsummer</button>
        <button type="button" data-project-ai-prompt="Kontroller dette oppdraget. Ka mangler eller ser feil ut før faktura?">Ka mangler?</button>
        <button type="button" data-project-ai-prompt="Vurder pris og fakturagrunnlag for dette oppdraget. Er det noe eg bør kontrollere før eg fakturerer?">Sjekk pris</button>
      </div>
      <form class="work-order-chat-form" data-project-ai-form>
        <textarea rows="1" maxlength="4000" placeholder="Spør AI om dette oppdraget…" aria-label="Spør AI om dette oppdraget" data-project-ai-input></textarea>
        <div class="work-order-chat-actions">
          <button type="button" class="work-order-chat-image" data-project-ai-image>📷 Bilde / skjermbilde</button>
          <button type="submit" class="work-order-chat-send" data-project-ai-send>Send</button>
        </div>
      </form>`;

    const hero = workspace.querySelector(".field-hero");
    if (hero?.nextSibling) workspace.insertBefore(root, hero.nextSibling);
    else if (hero) hero.insertAdjacentElement("afterend", root);
    else workspace.prepend(root);

    bindChat(root, orderId);
    renderHistory(root, orderId);
    return root;
  }

  function addMessage(container, role, text, extraClass = "") {
    const wrap = document.createElement("div");
    wrap.className = `work-order-chat-message ${role === "user" ? "is-user" : "is-ai"}${extraClass ? ` ${extraClass}` : ""}`;
    const bubble = document.createElement("div");
    bubble.className = "work-order-chat-bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    return wrap;
  }

  function appendStructured(container, entry) {
    const view = entry?.view || {};
    const reply = view.reply || {};
    const wrap = document.createElement("div");
    wrap.className = "work-order-chat-message is-ai";
    const card = document.createElement("div");
    card.className = "work-order-chat-result";

    const summary = String(reply.summary || entry.content || "").trim();
    if (summary) {
      const p = document.createElement("p");
      p.textContent = summary;
      card.appendChild(p);
    }

    const steps = Array.isArray(reply.steps) ? reply.steps.slice(0, 4) : [];
    if (steps.length) {
      const list = document.createElement("ol");
      steps.forEach((step) => {
        const li = document.createElement("li");
        const title = String(step?.title || "").trim();
        const detail = String(step?.detail || "").trim();
        li.textContent = [title, detail].filter(Boolean).join(" – ");
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    const links = Array.isArray(view.links) ? view.links.slice(0, 3) : [];
    if (links.length) {
      const actions = document.createElement("div");
      actions.className = "work-order-chat-links";
      links.forEach((link) => {
        const href = safeAdminHref(link?.href);
        if (!href) return;
        const a = document.createElement("a");
        a.href = href;
        a.textContent = String(link?.label || "Åpne");
        actions.appendChild(a);
      });
      if (actions.childElementCount) card.appendChild(actions);
    }

    wrap.appendChild(card);
    container.appendChild(wrap);
  }

  function renderHistory(root, orderId) {
    const container = root.querySelector("[data-project-ai-messages]");
    if (!container) return;
    container.replaceChildren();
    const history = loadHistory(orderId);
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "work-order-chat-empty";
      empty.textContent = "Spør om kunden, arbeidet, pris, mangler eller fakturagrunnlaget.";
      container.appendChild(empty);
      return;
    }
    history.forEach((entry) => {
      if (entry.role === "assistant" && entry.view) appendStructured(container, entry);
      else addMessage(container, entry.role, entry.content);
    });
    container.scrollTop = container.scrollHeight;
  }

  function resizeInput(input) {
    input.style.height = "auto";
    input.style.height = `${Math.min(120, Math.max(44, input.scrollHeight))}px`;
  }

  async function apiChat(orderId, question, previousHistory) {
    const workspace = currentWorkspace();
    const response = await fetch(`${API_BASE}/admin/assistant/guide/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey() },
      body: JSON.stringify({
        question,
        history: previousHistory.slice(-10).map(({ role, content }) => ({ role, content })),
        pageContext: {
          page: "jobs",
          path: "oppdrag.html",
          title: document.title || "Oppdrag",
          heading: orderLabel(workspace || document),
          params: { workOrderId: orderId },
        },
      }),
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      location.href = "login.html";
      throw new Error("Logg inn på nytt.");
    }
    if (!response.ok) throw new Error(data?.error || `AI-feil ${response.status}`);
    return data;
  }

  async function ask(root, orderId, rawQuestion) {
    const question = String(rawQuestion || "").trim().slice(0, 4000);
    if (!question || busy || root.dataset.orderId !== orderId) return;

    const input = root.querySelector("[data-project-ai-input]");
    const send = root.querySelector("[data-project-ai-send]");
    const messages = root.querySelector("[data-project-ai-messages]");
    const history = loadHistory(orderId);
    const previousHistory = history.slice(-10);
    history.push({ role: "user", content: question });
    saveHistory(orderId, history);
    renderHistory(root, orderId);
    input.value = "";
    resizeInput(input);

    busy = true;
    send.disabled = true;
    const loading = addMessage(messages, "assistant", "Sjekker dette oppdraget…", "is-loading");
    messages.scrollTop = messages.scrollHeight;
    try {
      const data = await apiChat(orderId, question, previousHistory);
      loading.remove();
      const summary = String(data?.reply?.summary || data?.reply?.answer || "").trim();
      if (!summary) throw new Error("AI svarte uten innhold.");
      const next = loadHistory(orderId);
      next.push({
        role: "assistant",
        content: summary,
        view: {
          reply: {
            summary,
            steps: Array.isArray(data.reply?.steps) ? data.reply.steps.slice(0, 4) : [],
          },
          links: Array.isArray(data.links) ? data.links.slice(0, 3) : [],
        },
      });
      saveHistory(orderId, next);
      renderHistory(root, orderId);
    } catch (error) {
      loading.remove();
      addMessage(messages, "assistant", error?.message || "Kunne ikke kontakte AI akkurat nå.", "is-error");
      messages.scrollTop = messages.scrollHeight;
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  function openStructuredImageImport() {
    const trigger = currentWorkspace()?.querySelector("[data-work-ai-open]");
    if (trigger) {
      trigger.click();
      return;
    }
    alert("Bildeimporten er ikke klar ennå. Lukk og åpne oppdraget på nytt.");
  }

  function bindChat(root, orderId) {
    const form = root.querySelector("[data-project-ai-form]");
    const input = root.querySelector("[data-project-ai-input]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      ask(root, orderId, input.value);
    });
    input.addEventListener("input", () => resizeInput(input));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        ask(root, orderId, input.value);
      }
    });
    root.querySelectorAll("[data-project-ai-prompt]").forEach((button) => {
      button.addEventListener("click", () => ask(root, orderId, button.dataset.projectAiPrompt));
    });
    root.querySelector("[data-project-ai-clear]").addEventListener("click", () => {
      sessionStorage.removeItem(storageKey(orderId));
      renderHistory(root, orderId);
      input.focus();
    });
    root.querySelector("[data-project-ai-image]").addEventListener("click", openStructuredImageImport);
    resizeInput(input);
  }

  function enhance() {
    const workspace = currentWorkspace();
    if (!workspace) return;
    const orderId = workspace.dataset.orderId || "";
    if (!orderId) return;
    activeOrderId = orderId;
    createChat(workspace);
  }

  const observer = new MutationObserver(() => queueMicrotask(enhance));
  const detail = document.getElementById("detailModalContent") || document.body;
  observer.observe(detail, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enhance, { once: true });
  else enhance();
})();