(() => {
  "use strict";

  if (window.__sorgulenAiAdvisorWowLoaded) return;
  window.__sorgulenAiAdvisorWowLoaded = true;

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const CHAT_PATH = "/admin/assistant/guide/chat";
  const SENSITIVE_FIELD = /(pass(word)?|secret|token|api[ _-]?key|admin[ _-]?key|authorization|cookie|session|firebase|credential)/i;
  const OMIT_TYPES = new Set(["password", "hidden", "file", "submit", "button", "reset"]);
  const originalFetch = window.fetch.bind(window);

  function cleanText(value, max = 1200) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function fieldLabel(field) {
    if (!field) return "";
    const id = field.id;
    let label = "";
    if (id) {
      try { label = document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent || ""; }
      catch (_) { /* eldre nettleser */ }
    }
    if (!label) label = field.closest("label")?.textContent || "";
    return cleanText(label || field.getAttribute("aria-label") || field.placeholder || field.name || field.id, 180);
  }

  function fieldValue(field) {
    const type = String(field.type || field.tagName || "text").toLowerCase();
    if (field.tagName === "SELECT") {
      return cleanText(field.options?.[field.selectedIndex]?.text || field.value, 600);
    }
    if (type === "checkbox" || type === "radio") {
      return field.checked ? `Valgt${field.value && field.value !== "on" ? `: ${field.value}` : ""}` : "Ikke valgt";
    }
    return cleanText(field.value, 600);
  }

  function isSensitiveField(field, label) {
    const descriptor = `${field?.name || ""} ${field?.id || ""} ${label || ""} ${field?.autocomplete || ""}`;
    return SENSITIVE_FIELD.test(descriptor);
  }

  function mainContentRoot() {
    return document.querySelector("main, .admin-main, [role='main'], .admin-page") || document.body;
  }

  function buildClientSnapshot() {
    const root = mainContentRoot();
    let visibleText = cleanText(root?.innerText || "", 7000);
    if (visibleText.includes("Sørgulen AI")) {
      visibleText = visibleText.replace(/Sørgulen AI[\s\S]*?Spør kort om det du lurer på…?/i, "").trim().slice(0, 7000);
    }

    const selectedText = cleanText(window.getSelection?.()?.toString() || "", 1800);
    const fields = [];
    const elements = root?.querySelectorAll?.("input, textarea, select") || [];
    for (const field of elements) {
      if (fields.length >= 40) break;
      const type = String(field.type || field.tagName || "text").toLowerCase();
      if (OMIT_TYPES.has(type) || field.disabled) continue;
      if (field.closest("#sorgulenAiPanel")) continue;
      const label = fieldLabel(field);
      if (isSensitiveField(field, label)) continue;
      const value = fieldValue(field);
      if (!label && !value) continue;
      fields.push({
        name: cleanText(field.name || field.id, 120),
        label,
        type,
        value,
      });
    }

    const active = document.activeElement;
    const focusedLabel = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && !active.closest("#sorgulenAiPanel")
      ? fieldLabel(active)
      : "";

    return { visibleText, selectedText, focusedLabel, fields };
  }

  // Bare AI-chatten får et ekstra, sanitert øyeblikksbilde av siden. Ingen andre kall røres.
  window.fetch = async function sorgulenAdvisorFetch(input, init) {
    try {
      const url = typeof input === "string" ? input : input?.url || "";
      const method = String(init?.method || (typeof input !== "string" ? input?.method : "") || "GET").toUpperCase();
      if (method === "POST" && url.includes(CHAT_PATH) && typeof init?.body === "string") {
        const payload = JSON.parse(init.body);
        payload.pageContext = {
          ...(payload.pageContext && typeof payload.pageContext === "object" ? payload.pageContext : {}),
          clientSnapshot: buildClientSnapshot(),
        };
        init = { ...init, body: JSON.stringify(payload) };
      }
    } catch (_) {
      // Chatten skal fortsatt virke dersom sidekontekst ikke kunne bygges.
    }
    return originalFetch(input, init);
  };

  function adminKey() {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  function money(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return "0 kr";
    return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(amount) + " kr";
  }

  function shortModelName(value) {
    const model = String(value || "");
    if (model.includes("opus-5")) return "Opus 5";
    if (model.includes("sonnet-5")) return "Sonnet 5";
    if (model.includes("haiku")) return "Haiku";
    return model ? "AI" : "";
  }

  function assignImageFile(input, file) {
    if (!input || !file || !String(file.type || "").startsWith("image/")) return false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function waitForPanel(callback) {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const panel = document.getElementById("sorgulenAiPanel");
      const launcher = document.getElementById("sorgulenAiLauncher");
      if (panel && launcher) {
        window.clearInterval(timer);
        callback(panel, launcher);
      } else if (Date.now() - started > 15_000) {
        window.clearInterval(timer);
      }
    }, 80);
  }

  waitForPanel((panel, launcher) => {
    if (panel.dataset.advisorWow === "true") return;
    panel.dataset.advisorWow = "true";

    const input = panel.querySelector("#saiInput");
    const form = panel.querySelector("#saiForm");
    const imageInput = panel.querySelector("#saiImageInput");
    const readonlyCopy = panel.querySelector(".sai-readonly-note span:last-child");
    if (readonlyCopy) readonlyCopy.textContent = "Bedriftsrådgiver · ser admin-data + siden du står på · endrer ingenting uten deg";

    launcher.title = "Åpne Sørgulen AI (Ctrl/⌘ + K)";
    const badge = document.createElement("span");
    badge.className = "sai-launcher-badge";
    badge.hidden = true;
    badge.setAttribute("aria-label", "AI har viktige driftsvarsler");
    launcher.appendChild(badge);

    const radarButton = document.createElement("button");
    radarButton.type = "button";
    radarButton.className = "sai-radar-strip is-loading";
    radarButton.innerHTML = `
      <span class="sai-radar-orb" aria-hidden="true"></span>
      <span class="sai-radar-copy">
        <strong>Driftsradar</strong>
        <span data-radar-headline>Sjekker firmaet…</span>
      </span>
      <span class="sai-radar-score" data-radar-score>–</span>
    `;

    const readonly = panel.querySelector(".sai-readonly-note");
    readonly?.insertAdjacentElement("afterend", radarButton);

    const powerActions = document.createElement("div");
    powerActions.className = "sai-power-actions";
    const powerPrompts = [
      ["✦", "Full firmasjekk", "Kjør en full firmasjekk. Bruk driftsradaren og admin-dataene. Fortell meg de viktigste tingene eg bør gjøre først, inkludert penger, kunder, oppdrag, faktura og risiko."],
      ["kr", "Finn penger", "Finn penger eller fakturagrunnlag eg kan ha glemt. Se etter ferdig arbeid uten faktura, utstedte fakturaer som ikke er sendt, forfalte fakturaer og andre konkrete ting eg bør følge opp."],
      ["↗", "Følg opp kunder", "Kven bør eg følge opp i dag, og hvorfor? Prioriter gamle prisforespørsler, bookinger og kunder som venter på meg."],
      ["◎", "Analyser siden", "Analyser siden eg står på akkurat no, inkludert synlige og ikke-lagrede felt. Fortell meg om du ser noe eg bør rette, kontrollere eller gjøre videre."],
    ];

    powerPrompts.forEach(([icon, label, prompt]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sai-power-button";
      const iconNode = document.createElement("span");
      iconNode.className = "sai-power-icon";
      iconNode.textContent = icon;
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      button.append(iconNode, labelNode);
      button.addEventListener("click", () => sendPrompt(prompt));
      powerActions.appendChild(button);
    });
    radarButton.insertAdjacentElement("afterend", powerActions);

    function openPanel() {
      if (!panel.classList.contains("is-open")) launcher.click();
      window.setTimeout(() => input?.focus(), 80);
    }

    function sendPrompt(prompt) {
      openPanel();
      if (!input || !form) return;
      input.value = prompt;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }

    radarButton.addEventListener("click", () => {
      sendPrompt("Gi meg driftsradaren forklart som min bedriftsrådgiver. Ka bør eg prioritere først akkurat no, ka kan vente, og er det noe eg sannsynligvis overser?");
    });

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPanel();
      }
    });

    input?.addEventListener("paste", (event) => {
      const files = [...(event.clipboardData?.files || [])];
      const image = files.find((file) => String(file.type || "").startsWith("image/"));
      if (!image) return;
      event.preventDefault();
      assignImageFile(imageInput, image);
    });

    panel.addEventListener("dragover", (event) => {
      if (![...(event.dataTransfer?.items || [])].some((item) => item.kind === "file")) return;
      event.preventDefault();
      panel.classList.add("sai-drop-active");
    });
    panel.addEventListener("dragleave", (event) => {
      if (!panel.contains(event.relatedTarget)) panel.classList.remove("sai-drop-active");
    });
    panel.addEventListener("drop", (event) => {
      panel.classList.remove("sai-drop-active");
      const image = [...(event.dataTransfer?.files || [])]
        .find((file) => String(file.type || "").startsWith("image/"));
      if (!image) return;
      event.preventDefault();
      assignImageFile(imageInput, image);
      openPanel();
    });

    async function loadRadar() {
      const key = adminKey();
      if (!key) return;
      try {
        const response = await originalFetch(`${API_BASE}/admin/assistant/guide/radar`, {
          headers: { "x-admin-key": key },
        });
        if (!response.ok) throw new Error("radar unavailable");
        const data = await response.json();
        const radar = data?.radar;
        if (!radar) throw new Error("missing radar");

        radarButton.classList.remove("is-loading", "is-critical", "is-attention", "is-good");
        radarButton.classList.add(radar.status === "critical" ? "is-critical" : radar.status === "attention" ? "is-attention" : "is-good");
        radarButton.querySelector("[data-radar-headline]").textContent = radar.headline || "Driftsradar klar";
        radarButton.querySelector("[data-radar-score]").textContent = String(Math.round(Number(radar.score || 0)));
        radarButton.title = `Driftsscore er en intern oppmerksomhetsindikator, ikke regnskap. AI-modell: ${shortModelName(data.aiModel) || "aktiv"}.`;

        const urgent = (radar.signals || []).filter((item) => ["critical", "high"].includes(item.severity)).length;
        badge.hidden = urgent <= 0;
        badge.textContent = urgent > 9 ? "9+" : String(urgent);

        const metrics = radar.metrics || {};
        const meta = document.createElement("span");
        meta.className = "sai-radar-meta";
        const fragments = [];
        if (Number(metrics.estimatedUnbilledAmount) > 0) fragments.push(`${money(metrics.estimatedUnbilledAmount)} mulig fakturagrunnlag`);
        if (Number(metrics.overdueAmount) > 0) fragments.push(`${money(metrics.overdueAmount)} forfalt`);
        if (!fragments.length && Number(metrics.paidLast30Days) > 0) fragments.push(`${money(metrics.paidLast30Days)} registrert betalt siste 30 d`);
        meta.textContent = fragments.slice(0, 2).join(" · ") || "Trykk for full vurdering";
        const copy = radarButton.querySelector(".sai-radar-copy");
        copy.querySelector(".sai-radar-meta")?.remove();
        copy.appendChild(meta);
      } catch (_) {
        radarButton.classList.remove("is-loading");
        radarButton.querySelector("[data-radar-headline]").textContent = "AI er klar · driftsradar kunne ikke hentes akkurat nå";
        radarButton.querySelector("[data-radar-score]").textContent = "AI";
      }
    }

    loadRadar();
    window.addEventListener("focus", () => {
      if (document.visibilityState === "visible") loadRadar();
    });
  });
})();
