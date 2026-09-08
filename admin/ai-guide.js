(() => {
  "use strict";

  if (!document.body.classList.contains("admin-app") || document.getElementById("sorgulenAiPanel")) return;

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const HISTORY_STORAGE = "sorgulen_ai_guide_history_v2";
  const MAX_LOCAL_HISTORY = 24;
  const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
  const MAX_UPLOAD_IMAGE_BYTES = 1_500_000;
  let busy = false;
  let imagePreparing = false;
  let selectedImage = null;

  const imageStyle = document.createElement("link");
  imageStyle.rel = "stylesheet";
  imageStyle.href = "ai-guide-image.css?v=20260909-image1";
  imageStyle.dataset.saiImageStyle = "true";
  if (!document.querySelector('link[data-sai-image-style="true"]')) document.head.appendChild(imageStyle);

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
      <div class="sai-image-preview" id="saiImagePreview" hidden>
        <img id="saiImagePreviewImg" alt="Bilde klart for AI-analyse">
        <div class="sai-image-preview-copy">
          <strong id="saiImagePreviewName">Bilde</strong>
          <span id="saiImagePreviewMeta">Klart for analyse</span>
        </div>
        <button class="sai-image-remove" id="saiImageRemove" type="button" aria-label="Fjern bilde" title="Fjern bilde">×</button>
      </div>
      <div class="sai-compose-row">
        <input id="saiImageInput" type="file" accept="image/*" hidden>
        <button class="sai-image-button" id="saiImageButton" type="button" aria-label="Legg ved bilde" title="Legg ved bilde">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Zm2.5-.5a.5.5 0 0 0-.5.5v9.15l2.9-2.9a2 2 0 0 1 2.83 0l1.22 1.22 1.72-1.72a2 2 0 0 1 2.83 0L18 11.75V5.5a.5.5 0 0 0-.5-.5h-11Zm11.5 9.58-1.92-1.92-2.42 2.42a1 1 0 0 1-1.42 0l-1.93-1.93L6 17.46v1.04a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5v-3.92ZM9 8.5A1.5 1.5 0 1 1 6 8.5a1.5 1.5 0 0 1 3 0Z"/></svg>
        </button>
        <textarea id="saiInput" rows="1" maxlength="4000" placeholder="Spør kort om det du lurer på…" aria-label="Spør Sørgulen AI"></textarea>
        <button class="sai-send" id="saiSend" type="submit">Send</button>
      </div>
      <p class="sai-image-status" id="saiImageStatus" aria-live="polite" hidden></p>
    </form>
  `;

  document.body.append(backdrop, panel, launcher);

  const messages = panel.querySelector("#saiMessages");
  const suggestions = panel.querySelector("#saiSuggestions");
  const input = panel.querySelector("#saiInput");
  const sendButton = panel.querySelector("#saiSend");
  const contextNode = panel.querySelector("#saiContextLabel");
  const imageInput = panel.querySelector("#saiImageInput");
  const imageButton = panel.querySelector("#saiImageButton");
  const imagePreview = panel.querySelector("#saiImagePreview");
  const imagePreviewImg = panel.querySelector("#saiImagePreviewImg");
  const imagePreviewName = panel.querySelector("#saiImagePreviewName");
  const imagePreviewMeta = panel.querySelector("#saiImagePreviewMeta");
  const imageRemove = panel.querySelector("#saiImageRemove");
  const imageStatus = panel.querySelector("#saiImageStatus");

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
    p.textContent = "Skriv et spørsmål eller legg ved et bilde. Eg bruker kort, tall og steg når det gjør svaret raskere å forstå.";
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

  function setImageStatus(message = "", isError = false) {
    const text = String(message || "").trim();
    imageStatus.textContent = text;
    imageStatus.hidden = !text;
    imageStatus.classList.toggle("is-error", Boolean(isError));
  }

  function setComposerDisabled() {
    const disabled = busy || imagePreparing;
    sendButton.disabled = disabled;
    imageButton.disabled = disabled;
    imageInput.disabled = disabled;
  }

  function clearSelectedImage() {
    selectedImage = null;
    imageInput.value = "";
    imagePreview.hidden = true;
    imagePreviewImg.removeAttribute("src");
    imagePreviewName.textContent = "Bilde";
    imagePreviewMeta.textContent = "Klart for analyse";
    setImageStatus();
  }

  function renderSelectedImage() {
    if (!selectedImage) {
      clearSelectedImage();
      return;
    }
    imagePreviewImg.src = selectedImage.previewUrl;
    imagePreviewName.textContent = selectedImage.name || "Bilde";
    imagePreviewMeta.textContent = `${Math.max(1, Math.round(selectedImage.byteLength / 1024))} KB · klart for AI-analyse`;
    imagePreview.hidden = false;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, objectUrl });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Bildeformatet kunne ikke leses. Prøv JPEG/PNG/WebP eller ta et nytt bilde."));
      };
      image.src = objectUrl;
    });
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Kunne ikke klargjøre bildet."));
      }, "image/jpeg", quality);
    });
  }

  async function renderJpeg(image, maxDimension, quality) {
    const sourceWidth = Number(image.naturalWidth || image.width || 0);
    const sourceHeight = Number(image.naturalHeight || image.height || 0);
    if (!sourceWidth || !sourceHeight) throw new Error("Bildet mangler gyldig størrelse.");

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Nettleseren kunne ikke behandle bildet.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvasToJpeg(canvas, quality);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Kunne ikke lese det klargjorte bildet."));
      reader.readAsDataURL(blob);
    });
  }

  async function prepareImage(file) {
    if (!(file instanceof File)) throw new Error("Velg et bilde først.");
    if (!String(file.type || "").startsWith("image/")) throw new Error("Filen må være et bilde.");
    if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("Originalbildet er for stort. Velg et bilde under 25 MB.");

    const loaded = await loadImage(file);
    try {
      const attempts = [
        [1800, 0.84],
        [1800, 0.70],
        [1500, 0.72],
        [1200, 0.68],
      ];
      let blob = null;
      for (const [maxDimension, quality] of attempts) {
        blob = await renderJpeg(loaded.image, maxDimension, quality);
        if (blob.size <= MAX_UPLOAD_IMAGE_BYTES) break;
      }
      if (!blob || blob.size > MAX_UPLOAD_IMAGE_BYTES) {
        throw new Error("Bildet ble fortsatt for stort etter komprimering. Prøv et annet bilde.");
      }

      const previewUrl = await blobToDataUrl(blob);
      const commaIndex = previewUrl.indexOf(",");
      if (commaIndex < 0) throw new Error("Kunne ikke klargjøre bildet.");
      return {
        name: String(file.name || "Bilde").slice(0, 120),
        mediaType: "image/jpeg",
        data: previewUrl.slice(commaIndex + 1),
        previewUrl,
        byteLength: blob.size,
      };
    } finally {
      URL.revokeObjectURL(loaded.objectUrl);
    }
  }

  async function handleImageSelection(file) {
    if (!file || busy || imagePreparing) return;
    imagePreparing = true;
    setComposerDisabled();
    setImageStatus("Klargjør bilde for AI…");
    try {
      selectedImage = await prepareImage(file);
      renderSelectedImage();
      setImageStatus();
      input.focus();
    } catch (error) {
      clearSelectedImage();
      setImageStatus(error?.message || "Kunne ikke klargjøre bildet.", true);
    } finally {
      imagePreparing = false;
      setComposerDisabled();
    }
  }

  async function apiChat(question, previousHistory, image = null) {
    const payload = {
      question,
      history: previousHistory.map(({ role, content }) => ({ role, content })).slice(-10),
      pageContext: currentPageContext(),
    };
    if (image) payload.image = { mediaType: image.mediaType, data: image.data };

    const response = await fetch(`${API_BASE}/admin/assistant/guide/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey() },
      body: JSON.stringify(payload),
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
    const image = selectedImage;
    if ((!question && !image) || busy || imagePreparing) return;

    const previousHistory = history.slice(-10);
    const visibleUserMessage = image
      ? `${question || "Bilde sendt"}\n📷 Bilde vedlagt`
      : question;
    history.push({ role: "user", content: visibleUserMessage, view: null });
    saveHistory();
    renderConversation();
    renderSuggestions();
    input.value = "";
    resizeInput();

    const loading = addBubble("assistant", image ? "Ser på bildet…" : "Sjekker…", "is-loading");
    messages.scrollTop = messages.scrollHeight;
    busy = true;
    setComposerDisabled();
    try {
      const data = await apiChat(question, previousHistory, image);
      loading.remove();
      const summary = String(data.reply?.summary || data.reply?.answer || "").trim();
      if (!summary) throw new Error("AI-veilederen returnerte ikke et svar.");
      history.push({
        role: "assistant",
        content: summary,
        view: cleanStoredView({ reply: data.reply, links: data.links || [], media: data.media || [] }),
      });
      saveHistory();
      clearSelectedImage();
      renderConversation();
      renderSuggestions(data.reply?.followUps);
    } catch (error) {
      loading.remove();
      const message = error?.message || "Kunne ikke kontakte AI-veilederen.";
      addBubble("assistant", message, "is-error");
      messages.scrollTop = messages.scrollHeight;
    } finally {
      busy = false;
      setComposerDisabled();
      input.focus();
    }
  }

  function clearConversation() {
    history = [];
    saveHistory();
    clearSelectedImage();
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
  imageButton.addEventListener("click", () => {
    if (!busy && !imagePreparing) imageInput.click();
  });
  imageInput.addEventListener("change", () => {
    const [file] = imageInput.files || [];
    if (file) handleImageSelection(file);
  });
  imageRemove.addEventListener("click", () => {
    if (!busy && !imagePreparing) {
      clearSelectedImage();
      input.focus();
    }
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
  setComposerDisabled();
})();