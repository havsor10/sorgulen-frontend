(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const STUDIO_API = API_BASE + "/admin/website-studio";
  const KEY_STORAGE = "sorgulen_admin_key";

  const el = (id) => document.getElementById(id);
  const createPanel = el("createPanel");
  const createType = el("createType");
  const createPrompt = el("createPrompt");
  const createImage = el("createImage");
  const createImageName = el("createImageName");
  const createDraftBtn = el("createDraftBtn");
  const draftList = el("draftList");
  const workspace = el("workspace");
  const noSelection = el("noSelection");
  const messageBox = el("studioMessage");
  const chatLog = el("chatLog");
  const chatInput = el("chatInput");
  const sendChatBtn = el("sendChatBtn");
  const publishBtn = el("publishBtn");
  const unpublishBtn = el("unpublishBtn");
  const saveDraftBtn = el("saveDraftBtn");
  const missingInfo = el("missingInfo");
  const previewCanvas = el("previewCanvas");
  const previewContent = el("previewContent");

  const fields = {
    title: el("fieldTitle"),
    summary: el("fieldSummary"),
    description: el("fieldDescription"),
    price: el("fieldPrice"),
    priceUnit: el("fieldPriceUnit"),
    priceLabel: el("fieldPriceLabel"),
    priceFrom: el("fieldPriceFrom"),
    badge: el("fieldBadge"),
    design: el("fieldDesign"),
    specs: el("fieldSpecs"),
    highlights: el("fieldHighlights"),
    included: el("fieldIncluded"),
    requirements: el("fieldRequirements"),
    faq: el("fieldFaq"),
    ctaLabel: el("fieldCtaLabel"),
    ctaUrl: el("fieldCtaUrl"),
    image: el("fieldImage"),
    seoTitle: el("fieldSeoTitle"),
    seoDescription: el("fieldSeoDescription"),
    social: el("fieldSocial"),
    bookable: el("fieldBookable"),
    duration: el("fieldDuration"),
  };

  const TYPE_LABELS = {
    service: "Tjeneste",
    rental: "Utleie",
    campaign: "Kampanje",
    social: "Reklame",
    section: "Seksjon",
  };
  const UNIT_LABELS = { fixed: "kr", hour: "kr/time", day: "kr/døgn", week: "kr/uke", item: "kr/stk", custom: "" };
  const isWebsiteType = (type) => ["service", "rental", "campaign", "section"].includes(type);

  let drafts = [];
  let current = null;
  let filter = "";
  let dirty = false;
  let busy = false;

  function getAdminKey() {
    let key = (localStorage.getItem(KEY_STORAGE) || "").trim();
    if (!key) {
      key = (prompt("Skriv inn admin-nøkkel:") || "").trim();
      if (key) localStorage.setItem(KEY_STORAGE, key);
    }
    return key;
  }

  function apiHeaders(json = true) {
    const headers = { "x-admin-key": getAdminKey() };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  async function api(path, options = {}) {
    const response = await fetch(STUDIO_API + path, {
      ...options,
      headers: { ...apiHeaders(true), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      throw new Error("Admin-nøkkelen er ugyldig. Logg inn på nytt.");
    }
    if (!response.ok) {
      const error = new Error(data.error || "Noe gikk galt");
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function setMessage(text, type = "info") {
    messageBox.textContent = text || "";
    messageBox.className = "status-message " + (text ? type : "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Kunne ikke lese bildet"));
      reader.readAsDataURL(file);
    });
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("no-NO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
    } catch (_) { return ""; }
  }

  function lines(value) {
    return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
  }

  function specsFromText(value) {
    return lines(value).map((line) => {
      const index = line.indexOf(":");
      if (index < 0) return { label: "Info", value: line };
      return { label: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    }).filter((item) => item.value);
  }

  function faqFromText(value) {
    return lines(value).map((line) => {
      const index = line.indexOf("|");
      if (index < 0) return null;
      return { question: line.slice(0, index).trim(), answer: line.slice(index + 1).trim() };
    }).filter(Boolean);
  }

  function textFromSpecs(value) {
    return (Array.isArray(value) ? value : []).map((item) => item.label + ": " + item.value).join("\n");
  }

  function textFromFaq(value) {
    return (Array.isArray(value) ? value : []).map((item) => item.question + " | " + item.answer).join("\n");
  }

  function currentContentFromForm() {
    if (!current) return {};
    return {
      title: fields.title.value.trim(),
      slug: current.slug || "",
      summary: fields.summary.value.trim(),
      description: fields.description.value.trim(),
      badgeLabel: fields.badge.value.trim(),
      price: {
        amount: Number(fields.price.value || 0),
        from: fields.priceFrom.checked,
        unit: fields.priceUnit.value,
        label: fields.priceLabel.value.trim(),
      },
      specs: specsFromText(fields.specs.value),
      highlights: lines(fields.highlights.value),
      included: lines(fields.included.value),
      requirements: lines(fields.requirements.value),
      faq: faqFromText(fields.faq.value),
      cta: { label: fields.ctaLabel.value.trim(), url: fields.ctaUrl.value.trim() },
      media: {
        imageUrl: current.media?.imageUrl || "",
        imageAlt: current.media?.imageAlt || fields.title.value.trim(),
      },
      seo: { title: fields.seoTitle.value.trim(), description: fields.seoDescription.value.trim() },
      socialCopy: fields.social.value.trim(),
      designVariant: fields.design.value,
      serviceSettings: {
        bookable: fields.bookable.checked,
        duration: Number(fields.duration.value || 60),
      },
      needsInput: Boolean(current.needsInput),
      questions: current.questions || [],
    };
  }

  function populate(item) {
    current = item;
    fields.title.value = item.title || "";
    fields.summary.value = item.summary || "";
    fields.description.value = item.description || "";
    fields.price.value = Number(item.price?.amount || 0);
    fields.priceUnit.value = item.price?.unit || "fixed";
    fields.priceLabel.value = item.price?.label || "";
    fields.priceFrom.checked = Boolean(item.price?.from);
    fields.badge.value = item.badgeLabel || "";
    fields.design.value = item.designVariant || "premium";
    fields.specs.value = textFromSpecs(item.specs);
    fields.highlights.value = (item.highlights || []).join("\n");
    fields.included.value = (item.included || []).join("\n");
    fields.requirements.value = (item.requirements || []).join("\n");
    fields.faq.value = textFromFaq(item.faq);
    fields.ctaLabel.value = item.cta?.label || "";
    fields.ctaUrl.value = item.cta?.url || "";
    fields.seoTitle.value = item.seo?.title || "";
    fields.seoDescription.value = item.seo?.description || "";
    fields.social.value = item.socialCopy || "";
    fields.bookable.checked = Boolean(item.serviceSettings?.bookable);
    fields.duration.value = String(item.serviceSettings?.duration || 60);
    fields.image.value = "";
    el("currentImageText").textContent = item.media?.imageUrl ? "Bilde er lagret på utkastet" : "Ingen bilde valgt";
    el("serviceSettings").hidden = item.type !== "service";
    el("workspaceTitle").textContent = item.title || "Nytt innhold";
    el("draftTypeBadge").textContent = TYPE_LABELS[item.type] || item.type;
    el("draftStatus").textContent = item.status === "published"
      ? (isWebsiteType(item.type) ? "Live på nettsida" : "Godkjent / klar")
      : item.status === "archived" ? "Arkivert" : "Utkast";
    el("draftStatus").classList.toggle("is-live", item.status === "published");
    el("workspaceUpdated").textContent = item.updatedAt ? "Sist endret " + formatDate(item.updatedAt) : "";
    unpublishBtn.hidden = item.status !== "published";
    publishBtn.textContent = item.type === "social"
      ? (item.status === "published" ? "Godkjenn endringer" : "Godkjenn innlegg")
      : (item.status === "published" ? "Publiser endringer" : "Publiser");
    renderConversation();
    renderMissing();
    renderPreview();
    dirty = false;
    workspace.hidden = false;
    noSelection.hidden = true;
    renderDraftList();
  }

  function renderDraftList() {
    const visible = filter ? drafts.filter((item) => item.status === filter) : drafts;
    if (!visible.length) {
      draftList.innerHTML = '<div class="studio-empty">Ingen innhold her ennå.</div>';
      return;
    }
    draftList.innerHTML = visible.map((item) => {
      const active = current && String(current._id) === String(item._id);
      const live = item.status === "published";
      const stateLabel = live ? (isWebsiteType(item.type) ? "LIVE" : "GODKJENT") : "UTKAST";
      return '<button class="studio-draft-item' + (active ? " is-active" : "") + '" data-id="' + escapeHtml(item._id) + '">' +
        '<strong>' + escapeHtml(item.title || "Uten tittel") + '</strong>' +
        '<small><span><i class="studio-draft-dot ' + (live ? "live" : "") + '"></i>' + escapeHtml(TYPE_LABELS[item.type] || item.type) + '</span><span>' + stateLabel + '</span></small>' +
      '</button>';
    }).join("");
    draftList.querySelectorAll("[data-id]").forEach((button) => {
      button.addEventListener("click", () => selectDraft(button.dataset.id));
    });
  }

  function renderConversation() {
    if (!current) return;
    const conversation = Array.isArray(current.conversation) ? current.conversation : [];
    chatLog.innerHTML = conversation.length ? conversation.map((entry) =>
      '<div class="studio-chat-bubble ' + (entry.role === "user" ? "user" : "assistant") + '">' +
      '<small>' + (entry.role === "user" ? "Du" : "AI Studio") + '</small>' +
      escapeHtml(entry.content || "") +
      '</div>'
    ).join("") : '<div class="studio-empty">Skriv til AI-en for å utvikle utkastet.</div>';
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderMissing() {
    const questions = Array.isArray(current?.questions) ? current.questions : [];
    if (!current?.needsInput || !questions.length) {
      missingInfo.hidden = true;
      missingInfo.innerHTML = "";
      return;
    }
    missingInfo.hidden = false;
    missingInfo.innerHTML = '<strong>AI-en mangler viktig informasjon før publisering</strong><span>Svar i AI-chatten:</span><ul>' +
      questions.map((q) => "<li>" + escapeHtml(q.question) + "</li>").join("") + "</ul>";
  }

  function priceText(content) {
    const amount = Number(content.price?.amount || 0);
    if (!amount && content.price?.label) return content.price.label;
    if (!amount) return "Pris avtales";
    const suffix = UNIT_LABELS[content.price?.unit] || "";
    const base = (content.price?.from ? "Fra " : "") + amount.toLocaleString("no-NO") + (suffix ? " " + suffix : "");
    return content.price?.label ? base + " · " + content.price.label : base;
  }

  function previewPills(content) {
    const specs = (content.specs || []).slice(0, 4).map((item) => item.label + ": " + item.value);
    const highlights = (content.highlights || []).slice(0, Math.max(0, 4 - specs.length));
    return [...specs, ...highlights].map((value) => "<span>" + escapeHtml(value) + "</span>").join("");
  }

  function renderPreview() {
    if (!current) return;
    const content = currentContentFromForm();
    const title = content.title || "Uten tittel";
    const summary = content.summary || "Kort beskrivelse kommer her.";
    const img = content.media?.imageUrl ? '<img src="' + escapeHtml(content.media.imageUrl) + '" alt="' + escapeHtml(content.media.imageAlt || title) + '">' : "<span>Produkt-/tjenestebilde</span>";
    const badge = content.badgeLabel ? '<span class="studio-preview-badge">' + escapeHtml(content.badgeLabel) + "</span>" : "";
    const cta = content.cta?.label || "Send forespørsel";

    if (current.type === "social") {
      previewContent.innerHTML = '<div class="studio-social-preview"><strong>Sørgulen Industriservice</strong><p>' + escapeHtml(content.socialCopy || content.description || summary) + "</p></div>";
      return;
    }
    if (current.type === "campaign") {
      previewContent.innerHTML = '<div class="studio-campaign-preview">' + (content.badgeLabel ? "<small>" + escapeHtml(content.badgeLabel) + "</small>" : "") +
        "<h2>" + escapeHtml(title) + "</h2><p>" + escapeHtml(summary) + '</p><div class="studio-preview-price">' + escapeHtml(priceText(content)) +
        '</div><span class="studio-preview-cta">' + escapeHtml(cta) + "</span></div>";
      return;
    }
    if (current.type === "section") {
      previewContent.innerHTML = '<div class="studio-campaign-preview"><small>NETTSIDESEKSJON</small><h2>' + escapeHtml(title) + "</h2><p>" + escapeHtml(content.description || summary) +
        '</p><span class="studio-preview-cta">' + escapeHtml(cta) + "</span></div>";
      return;
    }

    previewContent.innerHTML = '<article class="studio-preview-card ' + escapeHtml(content.designVariant || "premium") + '">' +
      '<div class="studio-preview-media">' + img + badge + "</div>" +
      '<div class="studio-preview-body"><h2>' + escapeHtml(title) + "</h2><p>" + escapeHtml(summary) + '</p>' +
      '<div class="studio-preview-price">' + escapeHtml(priceText(content)) + '</div>' +
      '<div class="studio-preview-pills">' + previewPills(content) + '</div>' +
      '<span class="studio-preview-cta">' + escapeHtml(cta) + "</span></div></article>";
  }

  async function loadDrafts({ keepSelection = true } = {}) {
    try {
      const data = await api("/drafts");
      drafts = Array.isArray(data.items) ? data.items : [];
      renderDraftList();
      if (keepSelection && current) {
        const fresh = drafts.find((item) => String(item._id) === String(current._id));
        if (fresh) populate(fresh);
      }
    } catch (error) {
      setMessage(error.message, "error");
      draftList.innerHTML = '<div class="studio-empty">Kunne ikkje laste innhold.</div>';
    }
  }

  async function selectDraft(id) {
    if (busy) return;
    if (dirty && current && !confirm("Du har ulagrede endringer. Åpne et annet utkast likevel?")) return;
    const found = drafts.find((item) => String(item._id) === String(id));
    if (found) populate(found);
    try {
      const data = await api("/drafts/" + encodeURIComponent(id));
      populate(data.item);
    } catch (error) { setMessage(error.message, "error"); }
  }

  async function uploadPendingImage() {
    if (!current || !fields.image.files?.[0]) return;
    const dataUrl = await fileToDataUrl(fields.image.files[0]);
    const data = await api("/drafts/" + encodeURIComponent(current._id) + "/image", {
      method: "POST",
      body: JSON.stringify({ imageDataUrl: dataUrl }),
    });
    current = data.item;
    fields.image.value = "";
    el("currentImageText").textContent = "Bilde er lagret på utkastet";
  }

  async function saveDraft({ quiet = false } = {}) {
    if (!current || busy) return false;
    busy = true;
    saveDraftBtn.disabled = true;
    const old = saveDraftBtn.textContent;
    saveDraftBtn.textContent = "Lagrer…";
    try {
      await uploadPendingImage();
      const data = await api("/drafts/" + encodeURIComponent(current._id), {
        method: "PATCH",
        body: JSON.stringify({ content: currentContentFromForm() }),
      });
      current = data.item;
      const index = drafts.findIndex((item) => String(item._id) === String(current._id));
      if (index >= 0) drafts[index] = current;
      dirty = false;
      populate(current);
      if (!quiet) setMessage("Utkastet er lagret.", "success");
      return true;
    } catch (error) {
      setMessage(error.message, "error");
      return false;
    } finally {
      busy = false;
      saveDraftBtn.disabled = false;
      saveDraftBtn.textContent = old;
    }
  }

  async function createDraft() {
    if (busy) return;
    const promptText = createPrompt.value.trim();
    if (!promptText) {
      setMessage("Beskriv først hva du vil lage.", "error");
      createPrompt.focus();
      return;
    }
    busy = true;
    createDraftBtn.disabled = true;
    const old = createDraftBtn.textContent;
    createDraftBtn.textContent = "AI bygger…";
    setMessage("AI-en bygger første utkast og finner ut kva den eventuelt mangler…");
    try {
      const imageDataUrl = createImage.files?.[0] ? await fileToDataUrl(createImage.files[0]) : "";
      const data = await api("/drafts", {
        method: "POST",
        body: JSON.stringify({ type: createType.value, prompt: promptText, imageDataUrl }),
      });
      createPrompt.value = "";
      createImage.value = "";
      createImageName.textContent = "Valgfritt – AI kan bruke bildet som kontekst";
      current = data.item;
      await loadDrafts({ keepSelection: false });
      populate(current);
      setMessage("Første utkast er klart. Snakk videre med AI-en eller finjuster direkte.", "success");
      workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      busy = false;
      createDraftBtn.disabled = false;
      createDraftBtn.textContent = old;
    }
  }

  async function sendChat(textOverride = "") {
    if (!current || busy) return;
    const text = String(textOverride || chatInput.value || "").trim();
    if (!text) return;
    if (dirty) {
      const saved = await saveDraft({ quiet: true });
      if (!saved) return;
    }
    busy = true;
    sendChatBtn.disabled = true;
    const old = sendChatBtn.textContent;
    sendChatBtn.textContent = "Tenker…";
    try {
      const data = await api("/drafts/" + encodeURIComponent(current._id) + "/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      chatInput.value = "";
      current = data.item;
      const index = drafts.findIndex((item) => String(item._id) === String(current._id));
      if (index >= 0) drafts[index] = current;
      populate(current);
      setMessage("AI-en har oppdatert utkastet.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      busy = false;
      sendChatBtn.disabled = false;
      sendChatBtn.textContent = old;
    }
  }

  async function publish(force = false) {
    if (!current || busy) return;
    if (dirty || fields.image.files?.length) {
      const saved = await saveDraft({ quiet: true });
      if (!saved) return;
    }
    busy = true;
    publishBtn.disabled = true;
    const old = publishBtn.textContent;
    publishBtn.textContent = current.type === "social" ? "Godkjenner…" : "Publiserer…";
    try {
      const data = await api("/drafts/" + encodeURIComponent(current._id) + "/publish", {
        method: "POST",
        body: JSON.stringify({ force }),
      });
      current = data.item;
      await loadDrafts({ keepSelection: false });
      populate(current);
      setMessage(current.type === "social"
        ? "Reklameinnlegget er godkjent og klart til bruk."
        : "Publisert. Dette innholdet er nå tilgjengelig på nettsida.", "success");
    } catch (error) {
      if (error.status === 409 && !force) {
        const list = (error.data?.questions || []).map((q) => "• " + q.question).join("\n");
        const ok = confirm("AI-en mener viktig informasjon fortsatt mangler:\n\n" + list + "\n\nVil du publisere likevel?");
        busy = false;
        publishBtn.disabled = false;
        publishBtn.textContent = old;
        if (ok) return publish(true);
        return;
      }
      setMessage(error.message, "error");
    } finally {
      busy = false;
      publishBtn.disabled = false;
      publishBtn.textContent = old;
    }
  }

  async function unpublish() {
    if (!current || busy) return;
    if (!confirm(current.type === "social"
      ? "Sette reklameinnlegget tilbake som utkast?"
      : "Ta dette innholdet av nettsida? Utkastet blir beholdt.")) return;
    busy = true;
    try {
      const data = await api("/drafts/" + encodeURIComponent(current._id) + "/unpublish", {
        method: "POST", body: "{}",
      });
      current = data.item;
      await loadDrafts({ keepSelection: false });
      populate(current);
      setMessage(current.type === "social"
        ? "Reklameinnlegget er satt tilbake som utkast."
        : "Innholdet er tatt av nettsida og ligger fortsatt som utkast.", "success");
    } catch (error) { setMessage(error.message, "error"); }
    finally { busy = false; }
  }

  createImage.addEventListener("change", () => {
    createImageName.textContent = createImage.files?.[0]?.name || "Valgfritt – AI kan bruke bildet som kontekst";
  });
  createDraftBtn.addEventListener("click", createDraft);
  el("newDraftBtn").addEventListener("click", () => {
    createPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    createPrompt.focus();
  });
  el("refreshDraftsBtn").addEventListener("click", () => loadDrafts());
  saveDraftBtn.addEventListener("click", () => saveDraft());
  sendChatBtn.addEventListener("click", () => sendChat());
  publishBtn.addEventListener("click", () => publish(false));
  unpublishBtn.addEventListener("click", unpublish);
  chatInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendChat();
  });

  document.querySelectorAll(".studio-filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".studio-filter").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      filter = button.dataset.filter || "";
      renderDraftList();
    });
  });

  document.querySelectorAll("[data-ai-action]").forEach((button) => {
    button.addEventListener("click", () => sendChat(button.dataset.aiAction || ""));
  });

  Object.values(fields).filter((node) => node && node !== fields.image).forEach((node) => {
    node.addEventListener(node.type === "checkbox" || node.tagName === "SELECT" ? "change" : "input", () => {
      if (!current) return;
      dirty = true;
      renderPreview();
      el("workspaceTitle").textContent = fields.title.value.trim() || "Uten tittel";
    });
  });

  fields.image.addEventListener("change", async () => {
    if (!current || !fields.image.files?.[0]) return;
    dirty = true;
    el("currentImageText").textContent = fields.image.files[0].name + " – lagres når du trykker Lagre";
    try {
      const localUrl = await fileToDataUrl(fields.image.files[0]);
      const old = current.media?.imageUrl || "";
      current = { ...current, media: { ...(current.media || {}), imageUrl: localUrl, _storedImageUrl: old } };
      renderPreview();
    } catch (_) {}
  });

  el("previewDeviceBtn").addEventListener("click", () => {
    previewCanvas.classList.toggle("is-mobile");
  });

  loadDrafts({ keepSelection: false });
})();