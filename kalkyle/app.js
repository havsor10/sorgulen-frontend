(() => {
  "use strict";

  // PROTOTYPE: kalkylen er lokal og bruker demonstrasjonssatsar. Ingen API-kall,
  // kundesynkronisering, databaseoperasjon eller automatisk utsending.
  const CATALOG = Object.freeze({
    brostein: { name: "Brostein – vask og vedlikehald", unit: "m²", capacity: 22, setup: 0.75, material: 11, equipment: 65 },
    kantklipp: { name: "Kantklipping", unit: "meter", capacity: 130, setup: 0.30, material: 0, equipment: 28 },
    plenklipp: { name: "Plenklipping", unit: "m²", capacity: 450, setup: 0.25, material: 0, equipment: 42 },
    hekk: { name: "Hekk og buskar", unit: "meter", capacity: 11, setup: 0.50, material: 0, equipment: 32 },
    takrenne: { name: "Takrenner", unit: "meter", capacity: 14, setup: 0.50, material: 0, equipment: 25 },
    rydding: { name: "Rydding / bortkøyring", unit: "m³", capacity: 1.8, setup: 0.50, material: 0, equipment: 35 },
    annet: { name: "Diverse arbeid", unit: "timeverk", capacity: 1, setup: 0, material: 0, equipment: 0 }
  });
  const COMPLEXITY = { easy: 0.85, normal: 1, demanding: 1.35, extreme: 1.7 };
  const ACCESS = { good: 1, medium: 1.15, difficult: 1.4 };
  const FIELD_IDS = ["projectName", "customerName", "address", "notes", "saleHourly", "costHourly", "travelMinutes", "markup", "otherCost", "disposalCost", "buffer", "vat"];
  const NUMERIC_FIELDS = new Set(["saleHourly", "costHourly", "travelMinutes", "markup", "otherCost", "disposalCost", "buffer", "vat"]);
  const $ = (id) => document.getElementById(id);
  let serial = 0;
  let toastTimer;
  let activePanel = "scope";

  const newItem = (type = "brostein", overrides = {}) => ({
    id: `op-${Date.now()}-${++serial}`,
    type: CATALOG[type] ? type : "annet",
    quantity: 130,
    complexity: "normal",
    access: "good",
    capacity: CATALOG[type]?.capacity ?? 1,
    setup: CATALOG[type]?.setup ?? 0,
    material: CATALOG[type]?.material ?? 0,
    equipment: CATALOG[type]?.equipment ?? 0,
    ...overrides
  });
  let items = [newItem("brostein")];

  const format = (v, digits = 0) => Number(v).toLocaleString("nb-NO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const money = (v) => `${format(Math.round(Number(v) || 0))} kr`;
  const hours = (v) => `${format(v, 1)} t`;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safeNum = (v, max = 10000000) => Math.max(0, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : 0));
  const getNum = (id) => safeNum($(id)?.value, id === "markup" ? 500 : id === "buffer" ? 100 : id === "vat" ? 25 : 10000000);
  const roundedOffer = (v) => Math.ceil((v - 1e-8) / 10) * 10;

  function calculate() {
    const ops = items.map((item) => {
      const c = CATALOG[item.type] || CATALOG.annet;
      const quantity = safeNum(item.quantity, 100000);
      const capacity = Math.max(0.01, safeNum(item.capacity, 100000));
      const setup = safeNum(item.setup, 100);
      const execution = quantity / capacity * (COMPLEXITY[item.complexity] || 1) * (ACCESS[item.access] || 1) + setup;
      const material = quantity * safeNum(item.material, 100000);
      const equipment = execution * safeNum(item.equipment, 100000);
      return { id: item.id, title: c.name, quantity, unit: c.unit, execution, material, equipment };
    });
    const executionHours = ops.reduce((s, op) => s + op.execution, 0);
    const travelHours = getNum("travelMinutes") / 60;
    const totalHours = executionHours + travelHours;
    const totalMaterialCost = ops.reduce((s, op) => s + op.material, 0);
    const equipmentCost = ops.reduce((s, op) => s + op.equipment, 0);
    const extraCost = getNum("otherCost") + getNum("disposalCost");
    const internalLaborCost = totalHours * getNum("costHourly");
    const costs = internalLaborCost + equipmentCost + totalMaterialCost + extraCost;
    const laborSale = totalHours * getNum("saleHourly");
    const extrasSale = (totalMaterialCost + extraCost) * (1 + getNum("markup") / 100);
    const salesBeforeBuffer = laborSale + extrasSale;
    const contingency = salesBeforeBuffer * getNum("buffer") / 100;
    const net = roundedOffer(salesBeforeBuffer + contingency);
    const vat = net * getNum("vat") / 100;
    const profit = net - costs;
    const margin = net > 0 ? (profit / net) * 100 : 0;
    const rangeFactor = items.some((op) => op.complexity === "extreme" || op.access === "difficult") ? 0.28 : items.some((op) => op.complexity === "demanding") ? 0.21 : 0.15;
    const variance = executionHours * getNum("saleHourly") * rangeFactor;
    const rangeLow = Math.max(0, Math.floor((net - variance) / 10) * 10);
    const rangeHigh = Math.max(net, Math.ceil((net + variance) / 10) * 10);
    return { ops, executionHours, travelHours, totalHours, totalMaterialCost, equipmentCost, extraCost, internalLaborCost, costs, laborSale, extrasSale, salesBeforeBuffer, contingency, net, vat, gross: net + vat, profit, margin, rangeLow, rangeHigh };
  }

  function renderOperations() {
    $("operations").innerHTML = items.map((item, i) => {
      const c = CATALOG[item.type];
      return `<article class="op-card" data-id="${esc(item.id)}">
        <div class="op-header"><div class="op-title"><span class="op-number">${String(i + 1).padStart(2, "0")}</span><h3>${esc(c.name)}</h3></div><button type="button" class="op-remove" data-remove="${esc(item.id)}" aria-label="Fjern ${esc(c.name)}">✕ Fjern</button></div>
        <div class="operation-grid">
          <label class="operation-field"><span>Mengd (${esc(c.unit)})</span><input type="number" min="0" max="100000" step="any" data-key="quantity" value="${esc(item.quantity)}"></label>
          <label class="operation-field"><span>Tilstand</span><select data-key="complexity"><option value="easy" ${item.complexity === "easy" ? "selected" : ""}>Enkel</option><option value="normal" ${item.complexity === "normal" ? "selected" : ""}>Normal</option><option value="demanding" ${item.complexity === "demanding" ? "selected" : ""}>Krevjande</option><option value="extreme" ${item.complexity === "extreme" ? "selected" : ""}>Svært krevjande</option></select></label>
          <label class="operation-field"><span>Tilkomst</span><select data-key="access"><option value="good" ${item.access === "good" ? "selected" : ""}>God</option><option value="medium" ${item.access === "medium" ? "selected" : ""}>Avgrensa</option><option value="difficult" ${item.access === "difficult" ? "selected" : ""}>Vanskeleg</option></select></label>
          <label class="operation-field"><span>Kapasitet (${esc(c.unit)}/t)</span><input type="number" min="0.01" max="100000" step="any" data-key="capacity" value="${esc(item.capacity)}"></label>
          <label class="operation-field"><span>Rigging (timar)</span><input type="number" min="0" max="100" step="any" data-key="setup" value="${esc(item.setup)}"></label>
          <label class="operation-field"><span>Materialkostnad (kr/${esc(c.unit)})</span><input type="number" min="0" max="100000" step="any" data-key="material" value="${esc(item.material)}"></label>
          <label class="operation-field"><span>Utstyrskostnad (kr/t)</span><input type="number" min="0" max="100000" step="any" data-key="equipment" value="${esc(item.equipment)}"></label>
        </div>
        <div class="op-preview"><span>Estimert arbeidstid inkludert rigg</span><strong data-op-hours="${esc(item.id)}">–</strong></div>
      </article>`;
    }).join("");
    $("operationCount").textContent = `${items.length} ${items.length === 1 ? "operasjon" : "operasjonar"}`;
  }

  function quality(calc) {
    const notes = [];
    if (!$("projectName").value.trim()) notes.push("Gi prosjektet eit namn før bruk.");
    if (!$("address").value.trim()) notes.push("Arbeidsstad er ikkje registrert.");
    if (!$("customerName").value.trim()) notes.push("Kunde er ikkje registrert.");
    if (items.some((item) => safeNum(item.quantity) === 0)) notes.push("Minst éin operasjon manglar mengd.");
    if (calc.margin < 15) notes.push("Låg berekna margin. Kontroller satsar og kostnader.");
    if (items.some((item) => item.complexity === "extreme" || item.access === "difficult")) notes.push("Krevjande arbeidsforhold bør stadfestast på befaring.");
    notes.push("Demoverdiar for kapasitet og satsar må kvalitetssikrast.");
    return notes;
  }

  function renderSummary(calc) {
    $("totalPrice").textContent = money(calc.net);
    $("quoteRange").textContent = `Indikativt spenn: ${money(calc.rangeLow)} – ${money(calc.rangeHigh)}`;
    $("timeEstimate").textContent = hours(calc.totalHours);
    $("costEstimate").textContent = money(calc.costs);
    $("profitEstimate").textContent = money(calc.profit);
    $("marginEstimate").textContent = `${format(calc.margin, 1)} %`;
    $("marginPct").textContent = `${format(calc.margin, 1)} %`;
    $("marginFill").style.width = `${Math.max(0, Math.min(100, calc.margin))}%`;
    $("marginFill").classList.toggle("negative", calc.margin < 0);
    $("profitEstimate").style.color = calc.profit < 0 ? "#bc4b4b" : "";
    const notes = quality(calc);
    $("qualityLabel").textContent = notes.length > 1 ? "Kontroller desse punkta før tilbod:" : "Kalkyleutkast – manuell kontroll nødvendig";
    $("qualityNotes").innerHTML = notes.map((n) => `<li>${esc(n)}</li>`).join("");
    for (const op of calc.ops) {
      const el = document.querySelector(`[data-op-hours="${op.id}"]`);
      if (el) el.textContent = hours(op.execution);
    }
  }

  function renderCostTable(c) {
    const rows = [
      ["Arbeid (inkl. transport)", c.laborSale],
      ["Material og tillegg med påslag", c.extrasSale],
      ["Kalkylebuffer", c.contingency],
      ["Tilbodspris eks. mva.", c.net, "table-total"],
      ["Intern arbeidskostnad", -c.internalLaborCost],
      ["Slitasje og utstyr", -c.equipmentCost],
      ["Materialinnkjøp og andre utgifter", -(c.totalMaterialCost + c.extraCost)],
      ["Berekna bruttoforteneste", c.profit, "table-total"]
    ];
    $("costTable").innerHTML = rows.map(([label, amount, cls]) => `<div class="table-line ${cls || ""}"><span>${esc(label)}</span><strong>${money(amount)}</strong></div>`).join("");
  }

  function offerLines(c) {
    const lines = c.ops.map((op) => ({ label: `${op.title} · ${format(op.quantity, op.quantity % 1 ? 1 : 0)} ${op.unit}`, sum: op.execution * getNum("saleHourly") }));
    if (c.travelHours > 0) lines.push({ label: `Transport · ${format(c.travelHours, 1)} t`, sum: c.travelHours * getNum("saleHourly") });
    if (c.totalMaterialCost > 0) lines.push({ label: "Material og forbruksmateriell", sum: c.totalMaterialCost * (1 + getNum("markup") / 100) });
    if (c.extraCost > 0) lines.push({ label: "Levering og andre tillegg", sum: c.extraCost * (1 + getNum("markup") / 100) });
    if (c.contingency > 0) lines.push({ label: "Kalkylebuffer", sum: c.contingency });
    // Avrundingsdifferansen visast for at summen av linjene skal samsvare med totalen.
    const delta = c.net - lines.reduce((sum, l) => sum + l.sum, 0);
    if (Math.abs(delta) > 0.001) lines.push({ label: "Avrunding", sum: delta });
    return lines;
  }

  function renderOffer(c) {
    const project = $("projectName").value.trim() || "Namn på oppdraget manglar";
    const customer = $("customerName").value.trim() || "Kunde ikkje registrert";
    const location = $("address").value.trim() || "Adresse ikkje registrert";
    const notes = $("notes").value.trim();
    const lines = offerLines(c);
    $("offerSheet").innerHTML = `<div class="paper-header"><div class="paper-logo">SØRGULEN<span>.</span><div style="font-size:8px;font-weight:650;letter-spacing:1px;color:#7d9883;margin-top:3px">INDUSTRISERVICE</div></div><div><h3>PRISTILBOD</h3><p>UTKAST · IKKJE SENDT</p></div></div>
      <div class="paper-meta"><div><small>TIL</small><strong>${esc(customer)}</strong><span>${esc(location)}</span></div><div><small>OPPDRAG</small><strong>${esc(project)}</strong><span>Estimert arbeidstid: ${esc(hours(c.totalHours))}</span></div></div>
      <div class="paper-description"><h4>Arbeidsbeskriving</h4><p>${esc(notes || "Arbeidet omfattar operasjonane som er spesifiserte nedanfor. Detaljar må gjennomgåast og stadfestast før eit bindande tilbod kan sendast.")}</p></div>
      <div class="paper-list-head"><span>ARBEID OG TILLEGG</span><span style="text-align:right">SUM EKS. MVA.</span></div>
      ${lines.map((l) => `<div class="paper-list-row"><span>${esc(l.label)}</span><span>${money(l.sum)}</span></div>`).join("")}
      <div class="paper-sum"><span>Tilbodspris eks. mva.</span><strong>${money(c.net)}</strong></div><div class="paper-vat">MVA ${format(getNum("vat"), 0)} %: ${money(c.vat)} &nbsp; · &nbsp; Total inkl. vald MVA: ${money(c.gross)}</div>
      <div class="paper-disclaimer"><strong>Viktig:</strong> Dette er eit uverifisert kalkyleutkast med demonstrasjonssatsar, ikkje eit bindande tilbod. Omfang, priser, MVA, arbeidsforhold, vilkår og eventuelle forbehold må kvalitetssikrast og godkjennast før utsending.</div>`;
  }

  function update() {
    const calc = calculate();
    renderSummary(calc);
    renderCostTable(calc);
    renderOffer(calc);
    return calc;
  }

  function goto(panel, scroll = true) {
    if (!["scope", "costs", "offer"].includes(panel)) return;
    activePanel = panel;
    document.querySelectorAll("[data-step]").forEach((button) => {
      const active = button.dataset.step === panel;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".panel").forEach((el) => { el.hidden = el.id !== `panel-${panel}`; });
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(message) {
    const el = $("toast");
    clearTimeout(toastTimer);
    el.textContent = message;
    el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function setValues(values) {
    for (const field of FIELD_IDS) {
      const el = $(field);
      if (values[field] !== undefined) el.value = String(values[field]).slice(0, field === "notes" ? 2000 : 180);
    }
  }

  function exportData() {
    return { version: 1, generatedAt: new Date().toISOString(), fields: Object.fromEntries(FIELD_IDS.map((key) => [key, $(key).value])), operations: items.map(({ id, ...rest }) => rest) };
  }

  function downloadDraft() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = $("projectName").value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "ny-kalkyle";
    a.href = href;
    a.download = `sorgulen-kalkyle-${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast("Utkast eksportert som JSON-fil. Ingen data er sendt til ein server.");
  }

  function importData(data) {
    if (!data || data.version !== 1 || !data.fields || !Array.isArray(data.operations) || !data.operations.length || data.operations.length > 15) {
      throw new Error("Ugyldig kalkylefil eller feil versjon.");
    }
    const approved = data.operations.map((raw) => {
      if (!raw || !CATALOG[raw.type]) throw new Error("Ukjend arbeidsoperasjon i fila.");
      return newItem(raw.type, {
        quantity: safeNum(raw.quantity, 100000),
        capacity: Math.max(0.01, safeNum(raw.capacity, 100000)),
        complexity: COMPLEXITY[raw.complexity] ? raw.complexity : "normal",
        access: ACCESS[raw.access] ? raw.access : "good",
        setup: safeNum(raw.setup, 100),
        material: safeNum(raw.material, 100000),
        equipment: safeNum(raw.equipment, 100000)
      });
    });
    items = approved;
    const validFields = {};
    for (const field of FIELD_IDS) {
      if (typeof data.fields[field] !== "string" && typeof data.fields[field] !== "number") continue;
      validFields[field] = NUMERIC_FIELDS.has(field) ? String(safeNum(data.fields[field], field === "vat" ? 25 : 10000000)) : String(data.fields[field]);
    }
    setValues(validFields);
    renderOperations();
    update();
    goto("scope");
  }

  function offerText(c) {
    const project = $("projectName").value.trim() || "Utan prosjektnamn";
    const customer = $("customerName").value.trim() || "Ikkje registrert";
    return [`SØRGULEN INDUSTRISERVICE – UTKAST TIL PRISTILBOD`, `Kunde: ${customer}`, `Oppdrag: ${project}`, `Stad: ${$("address").value.trim() || "Ikkje registrert"}`, "", `Beskriving: ${$("notes").value.trim() || "Sjå arbeidslinjene."}`, "", ...offerLines(c).map((l) => `${l.label}: ${money(l.sum)}`), "", `Sum eks. mva.: ${money(c.net)}`, `MVA (${getNum("vat")} %): ${money(c.vat)}`, `Total inkl. vald MVA: ${money(c.gross)}`, "", "Dette er eit uverifisert utkast, ikkje eit bindande tilbod. Kontroller alle satsar, mengder og vilkår."].join("\n");
  }

  document.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => goto(button.dataset.step)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => goto(button.dataset.go)));
  for (const id of FIELD_IDS) {
    $(id).addEventListener("input", update);
    $(id).addEventListener("change", update);
  }
  $("operations").addEventListener("input", (event) => {
    const row = event.target.closest(".op-card");
    const key = event.target.dataset.key;
    const op = items.find((item) => item.id === row?.dataset.id);
    if (!op || !key || !["quantity", "capacity", "setup", "material", "equipment", "complexity", "access"].includes(key)) return;
    op[key] = ["complexity", "access"].includes(key) ? event.target.value : (event.target.value === "" ? 0 : safeNum(event.target.value, key === "setup" ? 100 : 100000));
    update();
  });
  $("operations").addEventListener("change", (event) => {
    if (event.target.matches("select")) {
      const row = event.target.closest(".op-card");
      const op = items.find((item) => item.id === row?.dataset.id);
      if (op) { op[event.target.dataset.key] = event.target.value; update(); }
    }
  });
  $("operations").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    if (items.length === 1) return toast("Kalkylen må ha minst éin arbeidsoperasjon.");
    items = items.filter((item) => item.id !== button.dataset.remove);
    renderOperations();
    update();
  });
  $("addOperationBtn").addEventListener("click", () => {
    if (items.length >= 15) return toast("Maks 15 operasjonar per utkast.");
    const type = $("addType").value;
    items.push(newItem(type, { quantity: type === "rydding" ? 3 : type === "annet" ? 2 : type === "brostein" ? 50 : 25 }));
    renderOperations();
    update();
    $("operations").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("resetBtn").addEventListener("click", () => {
    setValues({ projectName: "", customerName: "", address: "", notes: "", saleHourly: "850", costHourly: "320", travelMinutes: "30", markup: "20", otherCost: "0", disposalCost: "0", buffer: "8", vat: "0" });
    items = [newItem("brostein", { quantity: 0 })];
    renderOperations(); update(); goto("scope"); toast("Utkastet er nullstilt.");
  });
  $("demoBtn").addEventListener("click", () => {
    setValues({ projectName: "Vask og fuging av brostein", customerName: "DEMO – eksempelperson", address: "DEMO – eksempeladresse i Florø", notes: "Vask av brostein ved inngangsparti. Nokre område med mose. Ny fugesand. God tilkomst og tilgang til vatn.", saleHourly: "850", costHourly: "320", travelMinutes: "30", markup: "20", otherCost: "300", disposalCost: "0", buffer: "8", vat: "0" });
    items = [newItem("brostein", { quantity: 130, complexity: "normal", access: "good" }), newItem("kantklipp", { quantity: 45, complexity: "easy", access: "good" })];
    renderOperations(); update(); goto("scope"); toast("Demooppdrag lagt inn. Tala er ikkje reelle prisar.");
  });
  $("exportBtn").addEventListener("click", downloadDraft);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 100000) return toast("Kalkylefila er for stor (maks 100 kB).");
    try { importData(JSON.parse(await file.text())); toast("Utkast importert."); }
    catch (err) { toast(`Kunne ikkje importere: ${err.message}`); }
  });
  $("copyOfferBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(offerText(calculate())); toast("Utkastet er kopiert."); }
    catch { toast("Kopiering er ikkje tilgjengeleg i denne nettlesaren."); }
  });
  $("printBtn").addEventListener("click", () => window.print());

  renderOperations();
  update();
  goto(activePanel, false);
})();
