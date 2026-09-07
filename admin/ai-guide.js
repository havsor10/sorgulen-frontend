(() => {
  "use strict";

  if (!document.body.classList.contains("admin-app") || document.getElementById("sorgulenAiPanel")) return;

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const HISTORY_STORAGE = "sorgulen_ai_guide_history_v2";
  const MAX_LOCAL_HISTORY = 24;
  let busy = false;

  const pageKey = document.getElementById("adminShell")?.dataset.page || "";
  const suggestionsByPage = {
    home: ["Ka bør eg prioritere først?", "Kven venter på svar?", "Ka bør faktureres?"],
    jobs: ["Oppsummer prosjektet", "Ka mangler før faktura?", "Hvordan registrerer eg dette riktig?"],
    customers: ["Oppsummer kunden", "Har kunden noe åpent?", "Ka bør eg følge opp?"],
    invoices: ["Ka er status?", "Ka mangler før utstedelse?", "Ka gjør eg videre?"],
    requests: ["Oppsummer forespørselen", "Ka er neste steg?", "Ka bør eg kontrollere?"],
    bookings: ["Ka krever handling?", "Ka er neste jobb?", "Oppsummer bookingene"],
    inventory: ["Ka begynner eg å gå tom for?", "Vis viktige lagerbevegelser", "Hvordan bruker eg dette på oppdrag?"],
    snow: ["Ka skjer i Brøytemodus?", "Kor mange står igjen?", "Kven bør eg ta neste?"],
  };
  const defaultSuggestions = ["Gi meg kort driftsoversikt", "Kven venter på meg?", "Ka bør eg gjøre først?"];

  function cleanStoredView(view) {
    if (!view || typeof view !== "object") return null;
    const reply = view.reply && typeof view.reply === "object" ? view.reply : null;
    if (!reply) return null;
    return {
      reply: {
        mode: String(reply.mode || "plain").slice(0, 30),
        summary: String(reply.summary || reply.answer || "").slice(0, 600),
        cards: Array.isArray(reply.cards) ? reply.cards.slice(0, 4) : [],
        steps: Array.isArray(reply.steps) ? reply.steps.slice(0, 4) : [],
        note: String(reply.note || "").slice(0, 400),
        followUps: Array.isArray(reply.followUps) ? reply.followUps.slice(0, 3) : [],
      },
      links: Array.isArray(view.links) ? view.links.slice(0, 6) : [],
      media: Array.isArray(view.media) ? view.media.slice(0, 3) : [],
    };
  }

  function loadHistory() {
    try {
      const value = JSON.parse(sessionStorage.getItem(HISTORY_STORAGE) || "[]");
      if (!Array.isArray(value)) return [];
      return value.slice(-MAX_LOCAL_HISTORY).map((entry) => {
        if (!["user", "assistant"].includes(entry?.role) || typeof entry?.content !== "string") return null;
        return {
          role: entry.role,
          content: entry.content.slice(0, 4000),
          view: entry.role === "assistant" ? cleanStoredView(entry.view) : null,
        };
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  let history = loadHistory();

  function saveHistory() {
    try { sessionStorage.setItem(HISTORY_STORAGE, JSON.stringify(history.slice(-MAX_LOCAL_HISTORY))); }
    catch (_) { /* sessionStorage er bare bekvemmelighet */ }
  }

  function adminKey() { return (localStorage.getItem(KEY_STORAGE) || "").trim(); }

  function currentPageContext() {
    const params = {};
    new URLSearchParams(window.location.search).forEach((value, key) => { params[key] = value; });
    const heading = document.querySelector("main h1, .admin-page-header h1, h1")?.textContent?.trim() || "";
    return {
      page: pageKey,
      path: window.location.pathname.split("/").filter(Boolean).at(-1) || "",
      title: document.title || "",
      heading,
      params,
    };
  }

  function contextLabel() {
    const ctx = currentPageContext();
    return ctx.heading || ({ home: "Hjem", jobs: "Oppdrag", customers: "Kunder", invoices: "Fakturaer", requests: "Forespørsler", bookings: "Bookinger", inventory: "Lager", snow: "Brøytemodus" })[pageKey] || "Admin";
  }

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "sai-launcher";
  launcher.id = "sorgulenAiLauncher";
  launcher.setAttribute("aria-controls", "sorgulenAiPanel");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<span class="sai-launcher-spark" aria-hidden="true">✦</span><span>Spør AI</span>';

  const backdrop = document.createElement("div");
  backdrop.className = "sai-backdrop";
  backdrop.id = "sorgulenAiBackdrop";
  backdrop.hidden = true;

  const panel = document.createElement("aside");
  panel.className = "sai-panel";
  panel.id = "sorgulenAiPanel";
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("aria-label", "Sørgulen AI-veileder");
  panel.innerHTML = `
    <div class="sai-head">
      <div class="sai-head-copy">
        <p class="sai-kicker">AI-veileder</p>
        <h2>Sørgulen AI</h2>
        <p class="sai-context-label" id="saiContextLabel"></p>
      </div>
      <div class="sai-head-actions">
        <button class="sai-head-button" type="button" data-ai-clear title="Ny samtale">Ny</button>
        <button class="sai-head-button" type="button" data-ai-close aria-label="Lukk AI-veileder">×</button>
      </div>
    </div>
    <div class="sai-readonly-note"><span class="sai-readonly-dot" aria-hidden="true"></span><span>Leser data · endrer ingenting</span></div>
    <div class="sai-messages" id="saiMessages" aria-live="polite"></div>
    <div class="sai-suggestions" id="saiSuggestions" aria-label="Forslag til spørsmål"></div>
    <form class="sai-form" id="saiForm">
      <textarea id="saiInput" rows="1" maxlength="4000" placeholder="Spør kort om det du lurer på…" aria-label="Spør Sørgulen AI"></textarea>
      <button class="sai-send" id="saiSend" type="submit">Send</button>
    </form>
  `;

  document.body.append(backdrop, panel, launcher);

  const messages = panel.querySelector("#saiMessages");
  const suggestions = panel.querySelector("#saiSuggestions");
  const input = panel.querySelector("#saiInput");
  const sendButton = panel.querySelector("#saiSend");
  const contextNode = panel.querySelector("#saiContextLabel");

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    document.body.classList.toggle("sai-open", open);
    contextNode.textContent = `Ser: ${contextLabel()}`;
    if (open) {
      renderConversation();
      renderSuggestions();
      window.setTimeout(() => input.focus(), 80);
    }
  }

  function addBubble(role, content, extraClass = "") {
    const wrap = document.createElement("div");
    wrap.className = `sai-message ${role === "user" ? "is-user" : "is-assistant"}${extraClass ? ` ${extraClass}` : ""}`;
    const bubble = document.createElement("div");
    bubble.className = "sai-bubble";
    bubble.textContent = content;
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    return wrap;
  }

  function renderEmpty() {
    const empty = document.createElement("div");
    empty.className = "sai-empty";
    const strong = document.createElement("strong");
    strong.textContent = "Spør. Eg gir deg kort svar.";
    const p = document.createElement("p");
    p.textContent = "Eg bruker små kort, tall og steg når det gjør svaret raskere å forstå.";
    empty.append(strong, p);
    messages.appendChild(empty);
  }

  function safeAdminHref(value) {
    const href = String(value || "");
    return /^[a-z0-9._-]+\.html(?:\?[^\s]*)?$/i.test(href) ? href : "";
  }

  function safeMediaUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.toString() : "";
    } catch (_) {
      return "";
    }
  }

  function linkMapFor(data) {
    const map = new Map();
    (data.links || []).forEach((link) => {
      const href = safeAdminHref(link?.href);
      if (href && link?.key) map.set(String(link.key), { ...link, href });
    });
    return map;
  }

  function renderCard(card, links) {
    const link = card?.linkKey ? links.get(String(card.linkKey)) : null;
    const node = document.createElement(link ? "a" : "div");
    node.className = `sai-card tone-${["info", "success", "warning", "danger"].includes(card?.tone) ? card.tone : "neutral"}`;
    if (link) node.href = link.href;

    if (card?.title) {
      const title = document.createElement("span");
      title.className = "sai-card-title";
      title.textContent = String(card.title);
      node.appendChild(title);
    }
    if (card?.value) {
      const value = document.createElement("strong");
      value.className = "sai-card-value";
      value.textContent = String(card.value);
      node.appendChild(value);
    }
    if (card?.detail) {
      const detail = document.createElement("span");
      detail.className = "sai-card-detail";
      detail.textContent = String(card.detail);
      node.appendChild(detail);
    }
    if (link) {
      const action = document.createElement("span");
      action.className = "sai-card-action";
      action.textContent = card?.actionLabel || "Åpne";
      node.appendChild(action);
    }
    return node;
  }

  function renderStructuredReply(data) {
    const reply = data?.reply || {};
    const wrap = document.createElement("div");
    wrap.className = "sai-message is-assistant";
    const result = document.createElement("div");
    result.className = `sai-result mode-${String(reply.mode || "plain")}`;
    const links = linkMapFor(data);

    const summaryText = String(reply.summary || reply.answer || "").trim();
    if (summaryText) {
      const answer = document.createElement("p");
      answer.className = "sai-answer";
      answer.textContent = summaryText;
      result.appendChild(answer);
    }

    const cards = Array.isArray(reply.cards) ? reply.cards.slice(0, 4) : [];
    if (cards.length) {
      const grid = document.createElement("div");
      grid.className = "sai-card-grid";
      cards.forEach((card) => grid.appendChild(renderCard(card, links)));
      result.appendChild(grid);
    }

    const steps = Array.isArray(reply.steps) ? reply.steps.slice(0, 4) : [];
    if (steps.length) {
      const list = document.createElement("ol");
      list.className = "sai-step-list";
      steps.forEach((step) => {
        const li = document.createElement("li");
        const number = document.createElement("span");
        number.className = "sai-step-number";
        number.textContent = String(list.children.length + 1);
        const copy = document.createElement("span");
        copy.className = "sai-step-copy";
        const title = document.createElement("strong");
        title.textContent = String(step?.title || "");
        copy.appendChild(title);
        if (step?.detail) {
          const detail = document.createElement("span");
          detail.textContent = String(step.detail);
          copy.appendChild(detail);
        }
        li.append(number, copy);
        list.appendChild(li);
      });
      result.appendChild(list);
    }

    const media = (data.media || []).slice(0, 3).map((item) => ({ ...item, url: safeMediaUrl(item?.url) })).filter((item) => item.url);
    if (media.length) {
      const row = document.createElement("div");
      row.className = "sai-media-row";
      media.forEach((item) => {
        const figure = document.createElement("figure");
        figure.className = "sai-media";
        const img = document.createElement("img");
        img.src = item.url;
        img.alt = String(item.alt || "Relevant bilde fra saken");
        img.loading = "lazy";
        figure.appendChild(img);
        row.appendChild(figure);
      });
      result.appendChild(row);
    }

    if (reply.note) {
      const note = document.createElement("p");
      note.className = "sai-note";
      note.textContent = String(reply.note);
      result.appendChild(note);
    }

    const usedKeys = new Set(cards.map((card) => String(card?.linkKey || "")).filter(Boolean));
    const remainingLinks = (data.links || []).filter((link) => link?.key && !usedKeys.has(String(link.key)) && safeAdminHref(link.href)).slice(0, 2);
    if (remainingLinks.length) {
      const row = document.createElement("div");
      row.className = "sai-links";
      remainingLinks.forEach((link) => {
        const anchor = document.createElement("a");
        anchor.className = "sai-link";
        anchor.href = safeAdminHref(link.href);
        anchor.textContent = link.label || "Åpne";
        row.appendChild(anchor);
      });
      result.appendChild(row);
    }

    wrap.appendChild(result);
    messages.appendChild(wrap);
  }

  function renderConversation() {
    messages.replaceChildren();
    if (!history.length) renderEmpty();
    history.forEach((entry) => {
      if (entry.role === "assistant" && entry.view) renderStructuredReply(entry.view);
      else addBubble(entry.role, entry.content);
    });
    messages.scrollTop = messages.scrollHeight;
  }

  function renderSuggestions(override) {
    suggestions.replaceChildren();
    const list = Array.isArray(override) && override.length ? override : (suggestionsByPage[pageKey] || defaultSuggestions);
    list.slice(0, 3).forEach((text) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sai-suggestion";
      button.textContent = text;
      button.title = text;
      button.addEventListener("click", () => ask(text));
      suggestions.appendChild(button);
    });
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(120, Math.max(46, input.scrollHeight))}px`;
  }

  async function apiChat(question, previousHistory) {
    const response = await fetch(`${API_BASE}/admin/assistant/guide/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey() },
      body: JSON.stringify({ question, history: previousHistory.map(({ role, content }) => ({ role, content })).slice(-10), pageContext: currentPageContext() }),
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      window.location.href = "login.html";
      throw new Error("Logg inn på nytt.");
    }
    if (!response.ok) throw new Error(data?.error || `AI-feil ${response.status}`);
    return data;
  }

  async function ask(rawQuestion) {
    const question = String(rawQuestion || "").trim().slice(0, 4000);
    if (!question || busy) return;
    const previousHistory = history.slice(-10);
    history.push({ role: "user", content: question, view: null });
    saveHistory();
    renderConversation();
    renderSuggestions();
    input.value = "";
    resizeInput();

    const loading = addBubble("assistant", "Sjekker…", "is-loading");
    messages.scrollTop = messages.scrollHeight;
    busy = true;
    sendButton.disabled = true;
    try {
      const data = await apiChat(question, previousHistory);
      loading.remove();
      const summary = String(data.reply?.summary || data.reply?.answer || "").trim();
      if (!summary) throw new Error("AI-veilederen returnerte ikke et svar.");
      history.push({
        role: "assistant",
        content: summary,
        view: cleanStoredView({ reply: data.reply, links: data.links || [], media: data.media || [] }),
      });
      saveHistory();
      renderConversation();
      renderSuggestions(data.reply?.followUps);
    } catch (error) {
      loading.remove();
      const message = error?.message || "Kunne ikke kontakte AI-veilederen.";
      addBubble("assistant", message, "is-error");
      messages.scrollTop = messages.scrollHeight;
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  function clearConversation() {
    history = [];
    saveHistory();
    renderConversation();
    renderSuggestions();
    input.value = "";
    resizeInput();
    input.focus();
  }

  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
  backdrop.addEventListener("click", () => setOpen(false));
  panel.querySelector("[data-ai-close]").addEventListener("click", () => setOpen(false));
  panel.querySelector("[data-ai-clear]").addEventListener("click", clearConversation);
  panel.querySelector("#saiForm").addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });
  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input.value);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) setOpen(false);
  });

  contextNode.textContent = `Ser: ${contextLabel()}`;
  renderConversation();
  renderSuggestions();
  resizeInput();
})();
