(() => {
  "use strict";

  if (!document.getElementById("adminShell") || document.getElementById("saiuPanel")) return;

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const HISTORY_STORAGE = "sorgulen_universal_ai_history_v1";
  const MAX_HISTORY = 20;
  const MAX_IMAGES = 3;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const TARGET_IMAGE_BYTES = 950_000;
  const MAX_DIMENSION = 1800;

  let busy = false;
  let images = [];

  function adminKey() {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  function safeJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function loadHistory() {
    const value = safeJson(sessionStorage.getItem(HISTORY_STORAGE) || "[]", []);
    if (!Array.isArray(value)) return [];
    return value.slice(-MAX_HISTORY).map((entry) => {
      if (!["user", "assistant"].includes(entry?.role) || typeof entry?.content !== "string") return null;
      return {
        role: entry.role,
        content: entry.content.slice(0, 5000),
        imageCount: Math.max(0, Math.min(MAX_IMAGES, Number(entry.imageCount) || 0)),
        view: entry.role === "assistant" && entry.view && typeof entry.view === "object" ? entry.view : null,
      };
    }).filter(Boolean);
  }

  let history = loadHistory();

  function saveHistory() {
    try { sessionStorage.setItem(HISTORY_STORAGE, JSON.stringify(history.slice(-MAX_HISTORY))); }
    catch (_) { /* historikk er kun bekvemmelighet */ }
  }

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.id = "saiuLauncher";
  launcher.className = "saiu-launcher";
  launcher.setAttribute("aria-controls", "saiuPanel");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<span class="saiu-launcher-dot" aria-hidden="true">✦</span><span>Spør AI</span>';

  const backdrop = document.createElement("div");
  backdrop.className = "saiu-backdrop";
  backdrop.hidden = true;

  const panel = document.createElement("aside");
  panel.id = "saiuPanel";
  panel.className = "saiu-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("aria-label", "Sørgulen AI");
  panel.innerHTML = `
    <div class="saiu-head">
      <div>
        <p class="saiu-kicker">Bedriftsrådgiver</p>
        <h2>Sørgulen AI</h2>
        <p id="saiuContext">Ser hele admin + bilder + nett ved behov</p>
      </div>
      <div class="saiu-head-actions">
        <button type="button" id="saiuNew">Ny</button>
        <button type="button" id="saiuClose" aria-label="Lukk">×</button>
      </div>
    </div>
    <div class="saiu-readonly">Leser og vurderer · utfører ingen kritiske handlinger uten deg</div>
    <div class="saiu-messages" id="saiuMessages" aria-live="polite"></div>
    <div class="saiu-quick" id="saiuQuick">
      <button type="button" data-prompt="Vurder denne jobben. Burde eg ta den, hvor mye jobb er det, hva er risikoen og ka bør eg svare kunden?">Vurder jobb</button>
      <button type="button" data-prompt="Ka bør eg prioritere akkurat no ut fra det du kan se i admin?">Prioriter</button>
      <button type="button" data-prompt="Vurder pris, tidsbruk og lønnsomhet i saken eg ser på no.">Pris og lønnsomhet</button>
      <button type="button" data-prompt="Bruk nettet hvis nødvendig og finn den eksterne informasjonen eg trenger om saken eg ser på.">Finn på nett</button>
    </div>
    <form class="saiu-compose" id="saiuForm">
      <div class="saiu-previews" id="saiuPreviews" hidden></div>
      <div class="saiu-row">
        <input type="file" id="saiuFiles" accept="image/*" multiple hidden>
        <button type="button" class="saiu-image-btn" id="saiuImageBtn">+ Bilde</button>
        <textarea class="saiu-input" id="saiuInput" rows="1" maxlength="4000" placeholder="Skriv eller send bilde…"></textarea>
        <button type="submit" class="saiu-send" id="saiuSend">Send</button>
      </div>
      <div class="saiu-status" id="saiuStatus"></div>
    </form>`;

  document.body.append(backdrop, panel, launcher);

  const messages = panel.querySelector("#saiuMessages");
  const input = panel.querySelector("#saiuInput");
  const form = panel.querySelector("#saiuForm");
  const send = panel.querySelector("#saiuSend");
  const fileInput = panel.querySelector("#saiuFiles");
  const imageBtn = panel.querySelector("#saiuImageBtn");
  const previews = panel.querySelector("#saiuPreviews");
  const status = panel.querySelector("#saiuStatus");
  const contextNode = panel.querySelector("#saiuContext");

  function pageLabel() {
    return document.querySelector("main h1, .admin-page-header h1, h1")?.textContent?.trim()
      || document.getElementById("adminShell")?.dataset.page
      || "Admin";
  }

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    contextNode.textContent = `Ser: ${pageLabel()} · admin + bilder + nett ved behov`;
    if (open) {
      renderHistory();
      window.setTimeout(() => input.focus(), 80);
    }
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(120, Math.max(44, input.scrollHeight))}px`;
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch (_) { return ""; }
  }

  function addBubble(role, text, imageCount = 0, extra = "") {
    const wrap = document.createElement("div");
    wrap.className = `saiu-msg ${role === "user" ? "is-user" : "is-ai"}${extra ? ` ${extra}` : ""}`;
    const bubble = document.createElement("div");
    bubble.className = "saiu-bubble";
    bubble.textContent = imageCount ? `${text || "Bilde sendt"}\n${imageCount} bilde${imageCount === 1 ? "" : "r"}` : text;
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    return wrap;
  }

  function addCopyButton(parent, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saiu-copy";
    button.textContent = "Kopier svar";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Kopiert";
        setTimeout(() => { button.textContent = "Kopier svar"; }, 1200);
      } catch (_) { button.textContent = "Kunne ikke kopiere"; }
    });
    parent.appendChild(button);
  }

  function renderStructured(entry) {
    const data = entry.view || {};
    const reply = data.reply || {};
    const wrap = document.createElement("div");
    wrap.className = "saiu-msg is-ai";
    const result = document.createElement("div");
    result.className = "saiu-result";

    const summary = document.createElement("p");
    summary.className = "saiu-summary";
    summary.textContent = reply.summary || entry.content || "";
    result.appendChild(summary);

    const cards = Array.isArray(reply.cards) ? reply.cards.slice(0, 5) : [];
    if (cards.length) {
      const grid = document.createElement("div");
      grid.className = "saiu-cards";
      cards.forEach((card) => {
        const node = document.createElement("div");
        const tone = ["success", "warning", "danger", "info"].includes(card?.tone) ? card.tone : "neutral";
        node.className = `saiu-card tone-${tone}`;
        if (card?.title) {
          const title = document.createElement("span");
          title.textContent = String(card.title);
          node.appendChild(title);
        }
        if (card?.value) {
          const value = document.createElement("strong");
          value.textContent = String(card.value);
          node.appendChild(value);
        }
        if (card?.detail) {
          const detail = document.createElement("p");
          detail.textContent = String(card.detail);
          node.appendChild(detail);
        }
        grid.appendChild(node);
      });
      result.appendChild(grid);
    }

    const steps = Array.isArray(reply.steps) ? reply.steps.slice(0, 5) : [];
    if (steps.length) {
      const list = document.createElement("ol");
      list.className = "saiu-steps";
      steps.forEach((step) => {
        const li = document.createElement("li");
        li.textContent = [step?.title, step?.detail].filter(Boolean).join(" – ");
        list.appendChild(li);
      });
      result.appendChild(list);
    }

    if (reply.note) {
      const note = document.createElement("p");
      note.className = "saiu-note";
      note.textContent = String(reply.note);
      result.appendChild(note);
    }

    if (reply.customerReply) {
      const box = document.createElement("div");
      box.className = "saiu-customer";
      const label = document.createElement("strong");
      label.textContent = "Forslag til kundesvar";
      const text = document.createElement("p");
      text.textContent = String(reply.customerReply);
      box.append(label, text);
      addCopyButton(box, String(reply.customerReply));
      result.appendChild(box);
    }

    if (data.webUsed) {
      const badge = document.createElement("span");
      badge.className = "saiu-web-badge";
      badge.textContent = "Sjekket nettet";
      result.appendChild(badge);
    }

    const sources = Array.isArray(data.sources) ? data.sources.slice(0, 6) : [];
    if (sources.length) {
      const sourceWrap = document.createElement("div");
      sourceWrap.className = "saiu-sources";
      sources.forEach((source) => {
        const href = safeUrl(source?.url);
        if (!href) return;
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = String(source?.title || href).slice(0, 70);
        sourceWrap.appendChild(link);
      });
      if (sourceWrap.childElementCount) result.appendChild(sourceWrap);
    }

    const followUps = Array.isArray(reply.followUps) ? reply.followUps.slice(0, 3) : [];
    if (followUps.length) {
      const buttons = document.createElement("div");
      buttons.className = "saiu-followups";
      followUps.forEach((text) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(text);
        button.addEventListener("click", () => ask(String(text)));
        buttons.appendChild(button);
      });
      result.appendChild(buttons);
    }

    wrap.appendChild(result);
    messages.appendChild(wrap);
  }

  function renderHistory() {
    messages.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("div");
      empty.className = "saiu-empty";
      const strong = document.createElement("strong");
      strong.textContent = "Send meg det du sitter med.";
      const p = document.createElement("p");
      p.textContent = "Kundemelding, maskin, arbeidssted, faktura, spørsmål eller flere bilder. Eg vurderer saken og bruker admin-data og nettet når det trengs.";
      empty.append(strong, p);
      messages.appendChild(empty);
      return;
    }
    history.forEach((entry) => {
      if (entry.role === "assistant" && entry.view) renderStructured(entry);
      else addBubble(entry.role, entry.content, entry.imageCount || 0);
    });
    messages.scrollTop = messages.scrollHeight;
  }

  function isVisible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function fieldLabel(field) {
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) return label.textContent?.trim() || "";
    }
    return field.closest("label")?.textContent?.trim() || field.getAttribute("aria-label") || field.name || "";
  }

  function pageSnapshot() {
    const main = document.querySelector("main") || document.body;
    const visibleText = (main?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 7000);
    const selectedText = String(window.getSelection?.()?.toString() || "").trim().slice(0, 1800);
    const active = document.activeElement;
    const fields = [...main.querySelectorAll("input, textarea, select")]
      .filter((field) => isVisible(field) && !["password", "hidden", "file", "submit", "button", "reset"].includes(String(field.type || "").toLowerCase()))
      .slice(0, 40)
      .map((field) => ({
        name: field.name || field.id || "",
        label: fieldLabel(field),
        type: String(field.type || field.tagName || "").toLowerCase(),
        value: field.tagName === "SELECT" ? field.options[field.selectedIndex]?.text || field.value : field.value,
      }));
    return {
      visibleText,
      selectedText,
      focusedLabel: active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ? fieldLabel(active) : "",
      fields,
    };
  }

  function pageContext() {
    const params = {};
    new URLSearchParams(location.search).forEach((value, key) => { params[key] = value; });
    return {
      page: document.getElementById("adminShell")?.dataset.page || "",
      path: location.pathname.split("/").filter(Boolean).at(-1) || "",
      title: document.title || "",
      heading: pageLabel(),
      params,
      clientSnapshot: pageSnapshot(),
    };
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Kunne ikke lese bildet."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Kunne ikke åpne bildet."));
      img.src = dataUrl;
    });
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  async function prepareImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Velg et bilde.");
    if (file.size > MAX_FILE_BYTES) throw new Error("Bildet er for stort.");

    const original = await fileToDataUrl(file);
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.88;
    let blob = await canvasBlob(canvas, quality);
    while (blob && blob.size > TARGET_IMAGE_BYTES && quality > 0.48) {
      quality -= 0.1;
      blob = await canvasBlob(canvas, quality);
    }
    if (!blob) throw new Error("Kunne ikke klargjøre bildet.");
    const dataUrl = await fileToDataUrl(new File([blob], "image.jpg", { type: "image/jpeg" }));
    return {
      mediaType: "image/jpeg",
      data: dataUrl.split(",")[1] || "",
      preview: dataUrl,
      name: String(file.name || "Bilde").slice(0, 80),
      bytes: blob.size,
    };
  }

  function renderPreviews() {
    previews.replaceChildren();
    previews.hidden = images.length === 0;
    images.forEach((image, index) => {
      const node = document.createElement("div");
      node.className = "saiu-preview";
      const img = document.createElement("img");
      img.src = image.preview;
      img.alt = image.name || `Bilde ${index + 1}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Fjern bilde");
      remove.addEventListener("click", () => {
        images.splice(index, 1);
        renderPreviews();
      });
      node.append(img, remove);
      previews.appendChild(node);
    });
    status.textContent = images.length ? `${images.length}/${MAX_IMAGES} bilder klare` : "";
  }

  async function addFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => String(file.type || "").startsWith("image/"));
    if (!files.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      status.textContent = `Maks ${MAX_IMAGES} bilder per melding.`;
      return;
    }
    imageBtn.disabled = true;
    status.textContent = "Klargjør bilder…";
    try {
      for (const file of files.slice(0, room)) {
        images.push(await prepareImage(file));
      }
      renderPreviews();
    } catch (error) {
      status.textContent = error?.message || "Kunne ikke klargjøre bildet.";
    } finally {
      imageBtn.disabled = false;
      fileInput.value = "";
    }
  }

  async function apiChat(question, previousHistory, outgoingImages) {
    const response = await fetch(`${API_BASE}/admin/assistant/universal/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey() },
      body: JSON.stringify({
        question,
        history: previousHistory.map(({ role, content }) => ({ role, content })),
        images: outgoingImages.map(({ mediaType, data }) => ({ mediaType, data })),
        pageContext: pageContext(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      location.href = "login.html";
      throw new Error("Logg inn på nytt.");
    }
    if (!response.ok) throw new Error(data.error || `AI-feil ${response.status}`);
    return data;
  }

  async function ask(rawQuestion) {
    const question = String(rawQuestion || "").trim().slice(0, 4000);
    if (busy || (!question && !images.length)) return;
    if (!adminKey()) {
      status.textContent = "Logg inn på nytt.";
      return;
    }

    const outgoingImages = images.slice();
    const previousHistory = history.slice(-12);
    history.push({ role: "user", content: question || "Analyser bildene.", imageCount: outgoingImages.length });
    saveHistory();
    images = [];
    renderPreviews();
    input.value = "";
    resizeInput();
    renderHistory();

    busy = true;
    send.disabled = true;
    imageBtn.disabled = true;
    status.textContent = outgoingImages.length ? "Analyserer bilder og admin-data…" : "Tenker…";
    const loading = addBubble("assistant", "Vurderer saken…", 0, "saiu-loading");
    messages.scrollTop = messages.scrollHeight;

    try {
      const data = await apiChat(question, previousHistory, outgoingImages);
      loading.remove();
      const summary = String(data?.reply?.summary || "").trim();
      if (!summary) throw new Error("AI svarte uten innhold.");
      history.push({
        role: "assistant",
        content: summary,
        view: {
          reply: data.reply,
          sources: Array.isArray(data.sources) ? data.sources.slice(0, 6) : [],
          webUsed: data.webUsed === true,
        },
      });
      saveHistory();
      renderHistory();
      status.textContent = data.webUsed ? "Nett + admin-data brukt" : "Admin-data og bildeanalyse brukt ved behov";
    } catch (error) {
      loading.remove();
      addBubble("assistant", error?.message || "Kunne ikke kontakte AI akkurat nå.", 0, "saiu-error");
      status.textContent = "";
    } finally {
      busy = false;
      send.disabled = false;
      imageBtn.disabled = false;
      messages.scrollTop = messages.scrollHeight;
      input.focus();
    }
  }

  launcher.addEventListener("click", () => setOpen(true));
  backdrop.addEventListener("click", () => setOpen(false));
  panel.querySelector("#saiuClose").addEventListener("click", () => setOpen(false));
  panel.querySelector("#saiuNew").addEventListener("click", () => {
    history = [];
    images = [];
    saveHistory();
    renderHistory();
    renderPreviews();
    status.textContent = "Ny samtale";
    input.focus();
  });
  imageBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => addFiles(fileInput.files));
  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input.value);
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });
  panel.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => ask(button.dataset.prompt));
  });

  document.addEventListener("paste", (event) => {
    if (panel.getAttribute("aria-hidden") === "true") return;
    const pasted = [...(event.clipboardData?.files || [])].filter((file) => String(file.type || "").startsWith("image/"));
    if (pasted.length) {
      event.preventDefault();
      addFiles(pasted);
    }
  });

  ["dragenter", "dragover"].forEach((type) => panel.addEventListener(type, (event) => {
    if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
    event.preventDefault();
    panel.classList.add("saiu-drop");
  }));
  ["dragleave", "drop"].forEach((type) => panel.addEventListener(type, (event) => {
    panel.classList.remove("saiu-drop");
    if (type === "drop") {
      event.preventDefault();
      addFiles(event.dataTransfer?.files);
    }
  }));

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Escape" && panel.classList.contains("is-open")) {
      setOpen(false);
    }
  });

  window.SorgulenUniversalAI = {
    open(prompt = "") {
      setOpen(true);
      if (prompt) {
        input.value = String(prompt).slice(0, 4000);
        resizeInput();
      }
    },
    ask(prompt) {
      setOpen(true);
      ask(String(prompt || ""));
    },
  };

  renderHistory();
  renderPreviews();
  resizeInput();
})();
