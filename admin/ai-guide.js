(() => {
  "use strict";

  if (!document.body.classList.contains("admin-app") || document.getElementById("sorgulenAiPanel")) return;

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const HISTORY_STORAGE = "sorgulen_ai_guide_history_v1";
  const MAX_LOCAL_HISTORY = 24;
  let busy = false;

  const pageKey = document.getElementById("adminShell")?.dataset.page || "";
  const suggestionsByPage = {
    home: ["Oppsummer det viktigste eg må gjøre i dag", "Ka bør eg prioritere først?", "Har eg noe som burde faktureres?"],
    jobs: ["Oppsummer dette prosjektet", "Ka mangler før dette er klart for faktura?", "Hvordan bør eg registrere tid, utgift eller materiale her?"],
    customers: ["Oppsummer denne kunden", "Har denne kunden åpne oppdrag eller ubetalte fakturaer?", "Ka bør eg følge opp med denne kunden?"],
    invoices: ["Forklar statusen på denne fakturaen", "Ka mangler før fakturaen kan utstedes?", "Forklar forskjellen på utkast, utstedt og sendt"],
    requests: ["Oppsummer denne forespørselen", "Ka er neste riktige steg her?", "Er det noe eg bør kontrollere før tilbudet sendes?"],
    bookings: ["Oppsummer bookingene mine", "Ka er neste planlagte jobb?", "Er det noe som krever handling?"],
    inventory: ["Ka begynner eg å gå tom for?", "Forklar hvordan eg bør bruke Lager mot et oppdrag", "Finn viktige lagerbevegelser eg bør være obs på"],
    snow: ["Oppsummer Brøytemodus akkurat nå", "Kor mange kunder står igjen?", "Ka bør eg prioritere i brøytekøen?"],
  };
  const defaultSuggestions = ["Gi meg en kort driftsoversikt", "Kven venter på svar fra meg?", "Forklar hvordan eg bør registrere en kostnad" ];

  function loadHistory() {
    try {
      const value = JSON.parse(sessionStorage.getItem(HISTORY_STORAGE) || "[]");
      if (!Array.isArray(value)) return [];
      return value.slice(-MAX_LOCAL_HISTORY).filter((entry) => ["user", "assistant"].includes(entry?.role) && typeof entry?.content === "string");
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
    <div class="sai-readonly-note"><span class="sai-readonly-dot" aria-hidden="true"></span><span>Veileder og leser data. Endrer ingenting uten en egen godkjent handling.</span></div>
    <div class="sai-messages" id="saiMessages" aria-live="polite"></div>
    <div class="sai-suggestions" id="saiSuggestions" aria-label="Forslag til spørsmål"></div>
    <form class="sai-form" id="saiForm">
      <textarea id="saiInput" rows="1" maxlength="4000" placeholder="Spør om kunden, prosjektet, faktura, tid, utgifter…" aria-label="Spør Sørgulen AI"></textarea>
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
    contextNode.textContent = `Ser kontekst fra: ${contextLabel()}`;
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
    strong.textContent = "Spør meg om det du ser i admin.";
    const p = document.createElement("p");
    p.textContent = "Eg kan oppsummere kunder og oppdrag, forklare fakturaer og hjelpe deg velge riktig registrering for tid, innkjøp, transport, utgifter og materialer.";
    empty.append(strong, p);
    messages.appendChild(empty);
  }

  function renderConversation() {
    messages.replaceChildren();
    if (!history.length) renderEmpty();
    history.forEach((entry) => addBubble(entry.role, entry.content));
    messages.scrollTop = messages.scrollHeight;
  }

  function makeSection(title, items, warning = false) {
    if (!Array.isArray(items) || !items.length) return null;
    const section = document.createElement("div");
    section.className = "sai-section";
    const heading = document.createElement("p");
    heading.className = "sai-section-title";
    heading.textContent = title;
    const list = document.createElement("ul");
    list.className = `sai-points${warning ? " sai-warnings" : ""}`;
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = String(item || "");
      list.appendChild(li);
    });
    section.append(heading, list);
    return section;
  }

  function renderStructuredReply(data) {
    const wrap = document.createElement("div");
    wrap.className = "sai-message is-assistant";
    const result = document.createElement("div");
    result.className = "sai-result";
    const answer = document.createElement("p");
    answer.className = "sai-answer";
    answer.textContent = data.reply?.answer || "";
    result.appendChild(answer);

    const points = makeSection("Viktig", data.reply?.keyPoints);
    const warnings = makeSection("Pass på", data.reply?.warnings, true);
    if (points) result.appendChild(points);
    if (warnings) result.appendChild(warnings);

    const safeLinks = (data.links || []).filter((link) => /^[a-z0-9._-]+\.html(?:\?[^\s]*)?$/i.test(String(link.href || "")));
    if (safeLinks.length) {
      const section = document.createElement("div");
      section.className = "sai-section";
      const title = document.createElement("p");
      title.className = "sai-section-title";
      title.textContent = "Åpne i admin";
      const row = document.createElement("div");
      row.className = "sai-links";
      safeLinks.forEach((link) => {
        const anchor = document.createElement("a");
        anchor.className = "sai-link";
        anchor.href = link.href;
        anchor.textContent = link.label || "Åpne";
        row.appendChild(anchor);
      });
      section.append(title, row);
      result.appendChild(section);
    }

    wrap.appendChild(result);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    renderSuggestions(data.reply?.followUps);
  }

  function renderSuggestions(override) {
    suggestions.replaceChildren();
    const list = Array.isArray(override) && override.length ? override : (suggestionsByPage[pageKey] || defaultSuggestions);
    list.slice(0, 4).forEach((text) => {
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
    input.style.height = `${Math.min(150, Math.max(48, input.scrollHeight))}px`;
  }

  async function apiChat(question, previousHistory) {
    const response = await fetch(`${API_BASE}/admin/assistant/guide/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey() },
      body: JSON.stringify({ question, history: previousHistory.slice(-10), pageContext: currentPageContext() }),
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
    history.push({ role: "user", content: question });
    saveHistory();
    renderConversation();
    renderSuggestions();
    input.value = "";
    resizeInput();

    const loading = addBubble("assistant", "Henter relevant informasjon fra admin…", "is-loading");
    messages.scrollTop = messages.scrollHeight;
    busy = true;
    sendButton.disabled = true;
    try {
      const data = await apiChat(question, previousHistory);
      loading.remove();
      const answer = String(data.reply?.answer || "").trim();
      if (!answer) throw new Error("AI-veilederen returnerte ikke et svar.");
      history.push({ role: "assistant", content: answer });
      saveHistory();
      renderConversation();
      renderStructuredReply(data);
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

  contextNode.textContent = `Ser kontekst fra: ${contextLabel()}`;
  renderConversation();
  renderSuggestions();
  resizeInput();
})();