(function () {
  "use strict";
  const BACKEND_URL = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const MAX_IMAGES = 4;
  const MAX_ROUNDS = 2;

  const imagesWrap = document.getElementById("peImages");
  const addBtn = document.getElementById("peAdd");
  const fileInput = document.getElementById("peFile");
  const submitBtn = document.getElementById("peSubmit");
  const msgBox = document.getElementById("peMsg");
  const questionsWrap = document.getElementById("peQuestions");
  const questionFields = document.getElementById("peQuestionFields");
  const categoryEl = document.getElementById("peCategory");
  const summaryEl = document.getElementById("peSummary");

  let imageData = [];
  let uploadedImageUrls = [];
  let round = 0;
  let category = "annet";
  let categoryLabel = "Annet oppdrag";
  let intakeSummary = "";
  let intakeComplete = false;
  const questions = [];
  const answers = new Map();

  addBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (event) => {
    for (const file of Array.from(event.target.files || [])) {
      if (imageData.length >= MAX_IMAGES) break;
      if (!file.type.startsWith("image/")) continue;
      try { imageData.push(await fileToDataUri(file)); } catch (_) {}
    }
    fileInput.value = "";
    uploadedImageUrls = [];
    renderThumbs();
  });

  function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderThumbs() {
    imagesWrap.querySelectorAll(".pe-thumb").forEach((node) => node.remove());
    imageData.forEach((uri, index) => {
      const thumb = document.createElement("div");
      thumb.className = "pe-thumb";
      const img = document.createElement("img");
      img.src = uri;
      img.alt = `Valgt bilde ${index + 1}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Fjern bilde");
      remove.addEventListener("click", () => {
        imageData.splice(index, 1);
        uploadedImageUrls = [];
        renderThumbs();
      });
      thumb.append(img, remove);
      imagesWrap.insertBefore(thumb, addBtn);
    });
    addBtn.style.display = imageData.length >= MAX_IMAGES ? "none" : "flex";
  }

  function showError(text) {
    msgBox.textContent = text;
    msgBox.classList.remove("pe-hidden");
    msgBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearError() {
    msgBox.classList.add("pe-hidden");
    msgBox.textContent = "";
  }

  function updateProgress(step) {
    ["peStep1", "peStep2", "peStep3"].forEach((id, index) => {
      const el = document.getElementById(id);
      el.classList.toggle("active", index + 1 === step);
      el.classList.toggle("done", index + 1 < step);
    });
  }

  function validateBasics() {
    const required = [
      ["peDesc", "Beskriv hva du trenger hjelp med."],
      ["peAddress", "Fyll inn adressen der jobben skal utføres."],
      ["peTiming", "Velg når du ønsker jobben utført."],
      ["peName", "Fyll inn navnet ditt."],
      ["pePhone", "Fyll inn telefonnummeret ditt."]
    ];
    for (const [id, message] of required) {
      if (!document.getElementById(id).value.trim()) {
        showError(message);
        document.getElementById(id).focus();
        return false;
      }
    }
    return true;
  }

  function fixedAnswers() {
    return [{
      id: "onsket_tidspunkt",
      type: "valg",
      question: "Når ønsker kunden jobben utført?",
      answer: document.getElementById("peTiming").value.trim()
    }];
  }

  function allAnswers() {
    return fixedAnswers().concat(questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      answer: answers.get(q.id) || ""
    })).filter((item) => item.answer));
  }

  function validateQuestions() {
    let firstMissing = null;
    questionFields.querySelectorAll(".pe-question").forEach((field) => {
      const id = field.dataset.qid;
      const q = questions.find((item) => item.id === id);
      const missing = q && q.required !== false && !String(answers.get(id) || "").trim();
      field.querySelector(".pe-question-error")?.remove();
      if (missing) {
        const error = document.createElement("div");
        error.className = "pe-question-error";
        error.textContent = "Svar på dette før du fortsetter.";
        field.appendChild(error);
        if (!firstMissing) firstMissing = field;
      }
    });
    if (firstMissing) {
      showError("Svar på de markerte spørsmålene. De trengs for å vurdere jobben.");
      firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  function renderQuestion(q) {
    const field = document.createElement("div");
    field.className = "pe-question";
    field.dataset.qid = q.id;

    const label = document.createElement("label");
    label.innerHTML = "";
    label.textContent = q.question;
    if (q.required !== false) {
      const req = document.createElement("span");
      req.className = "pe-required";
      req.textContent = " *";
      label.appendChild(req);
    }
    field.appendChild(label);

    if (q.type === "ja_nei" || q.type === "valg") {
      const options = q.type === "ja_nei" ? ["Ja", "Nei"] : (Array.isArray(q.options) ? q.options : []);
      const grid = document.createElement("div");
      grid.className = "pe-choice-grid";
      options.forEach((value) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pe-choice";
        button.textContent = value;
        if (answers.get(q.id) === value) button.classList.add("selected");
        button.addEventListener("click", () => {
          answers.set(q.id, value);
          grid.querySelectorAll(".pe-choice").forEach((item) => item.classList.toggle("selected", item === button));
          field.querySelector(".pe-question-error")?.remove();
          clearError();
        });
        grid.appendChild(button);
      });
      field.appendChild(grid);
    } else {
      const input = document.createElement("input");
      input.className = "pe-input";
      input.type = q.type === "tall" ? "number" : "text";
      if (q.type === "tall") {
        input.min = "0";
        input.step = "any";
      }
      input.placeholder = q.unit ? `Svar i ${q.unit}` : "Skriv kort svar";
      input.value = answers.get(q.id) || "";
      input.addEventListener("input", () => {
        answers.set(q.id, input.value);
        field.querySelector(".pe-question-error")?.remove();
        clearError();
      });
      field.appendChild(input);
    }
    return field;
  }

  function renderQuestions() {
    questionFields.innerHTML = "";
    questions.forEach((q) => questionFields.appendChild(renderQuestion(q)));
    if (questions.length) {
      questionsWrap.classList.remove("pe-hidden");
      categoryEl.textContent = categoryLabel;
      updateProgress(2);
    }
  }

  function addQuestions(incoming) {
    const known = new Set(questions.map((q) => q.id));
    let added = 0;
    (Array.isArray(incoming) ? incoming : []).forEach((q) => {
      if (!q || !q.id || known.has(q.id) || answers.has(q.id)) return;
      known.add(q.id);
      questions.push(q);
      added += 1;
    });
    renderQuestions();
    return added;
  }

  async function requestQuestions(nextRound) {
    const body = {
      description: document.getElementById("peDesc").value.trim(),
      customerAddress: document.getElementById("peAddress").value.trim(),
      answers: allAnswers(),
      round: nextRound,
      website: document.getElementById("peWebsite").value
    };
    if (uploadedImageUrls.length) body.uploadedImageUrls = uploadedImageUrls;
    else body.images = imageData;

    const response = await fetch(BACKEND_URL + "/requests/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kunne ikke kontrollere opplysningene.");

    if (Array.isArray(data.imageUrls)) uploadedImageUrls = data.imageUrls;
    category = data.category || category;
    categoryLabel = data.categoryLabel || categoryLabel;
    intakeSummary = data.summary || intakeSummary;
    intakeComplete = Boolean(data.complete);

    if (intakeSummary) {
      summaryEl.style.display = "block";
      summaryEl.textContent = intakeSummary;
    }
    return Array.isArray(data.questions) ? data.questions : [];
  }

  async function sendRequest() {
    updateProgress(3);
    submitBtn.disabled = true;
    submitBtn.textContent = "Sender…";

    const body = {
      customerName: document.getElementById("peName").value.trim(),
      customerPhone: document.getElementById("pePhone").value.trim(),
      customerEmail: document.getElementById("peEmail").value.trim(),
      customerAddress: document.getElementById("peAddress").value.trim(),
      description: document.getElementById("peDesc").value.trim(),
      website: document.getElementById("peWebsite").value,
      answers: allAnswers(),
      serviceCategory: category,
      serviceCategoryLabel: categoryLabel,
      intakeSummary,
      intakeRounds: round,
      intakeComplete: intakeComplete || round >= MAX_ROUNDS
    };
    if (uploadedImageUrls.length) body.uploadedImageUrls = uploadedImageUrls;
    else body.images = imageData;

    const response = await fetch(BACKEND_URL + "/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Noe gikk galt. Prøv igjen.");

    document.getElementById("peFormWrap").classList.add("pe-hidden");
    document.getElementById("peSuccess").classList.remove("pe-hidden");
    document.getElementById("peSuccess").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  submitBtn.addEventListener("click", async () => {
    clearError();
    if (!validateBasics()) return;
    if (questions.length && !validateQuestions()) return;

    submitBtn.disabled = true;
    submitBtn.classList.add("pe-loading");
    submitBtn.textContent = round === 0 ? "Analyserer jobben" : "Kontrollerer svar";

    try {
      if (round < MAX_ROUNDS) {
        const nextRound = round + 1;
        const incoming = await requestQuestions(nextRound);
        round = nextRound;
        const added = addQuestions(incoming);

        if (added > 0) {
          submitBtn.disabled = false;
          submitBtn.classList.remove("pe-loading");
          submitBtn.textContent = round < MAX_ROUNDS ? "Kontroller svar" : "Send forespørsel";
          questionsWrap.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }

      intakeComplete = true;
      submitBtn.classList.remove("pe-loading");
      await sendRequest();
    } catch (err) {
      showError(err.message || "Noe gikk galt. Prøv igjen.");
      submitBtn.disabled = false;
      submitBtn.classList.remove("pe-loading");
      submitBtn.textContent = round > 0 ? (round < MAX_ROUNDS ? "Kontroller svar" : "Send forespørsel") : "Fortsett";
    }
  });
})();\n