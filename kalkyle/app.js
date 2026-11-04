(() => {
  "use strict";

  // PROTOTYPE: kalkylen er lokal og bruker demonstrasjonssatsar. Ingen API-kall,
  // kundesynkronisering, databaseoperasjon eller automatisk utsending.
  // Kalkylemotoren held berekningane skilde frå brukargrensesnittet.
  const ENGINE = window.SorgulenPricing;
  if (!ENGINE) throw new Error("Kalkylemotoren manglar. Last sida på nytt.");
  const CATALOG = ENGINE.CATALOG;
  const COMPLEXITY = ENGINE.COMPLEXITY;
  const ACCESS = ENGINE.ACCESS;

  const FIELD_IDS = ["projectName", "customerName", "address", "notes", "jobDescription", "rateMode", "saleHourly", "costHourly", "travelMinutes", "markup", "otherCost", "disposalCost", "buffer", "vat"];
  const NUMERIC_FIELDS = new Set(["saleHourly", "costHourly", "travelMinutes", "markup", "otherCost", "disposalCost", "buffer", "vat"]);
  const $ = (id) => document.getElementById(id);
  let serial = 0;
  let toastTimer;
  let activePanel = "scope";

  const newItem = (type = "brostein", overrides = {}) => Object.assign(
    { id: "op-" + Date.now() + "-" + (++serial) }, ENGINE.makeItem(type, overrides)
  );

  let items = [newItem("brostein")];

  const format = (v, digits = 0) => Number(v).toLocaleString("nb-NO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const money = (v) => `${format(Math.round(Number(v) || 0))} kr`;
  const hours = (v) => `${format(v, 1)} t`;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safeNum = (v, max = 10000000) => Math.max(0, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : 0));
  const getNum = (id) => safeNum($(id)?.value, id === "markup" ? 500 : id === "buffer" ? 100 : id === "vat" ? 25 : 10000000);
  const roundedOffer = (v) => Math.ceil((v - 1e-8) / 10) * 10;

  function calculate() {
    return ENGINE.calculate(items, {
      rateMode: $("rateMode").value,
      costHourly: getNum("costHourly"), travelMinutes: getNum("travelMinutes"),
      markup: getNum("markup"), otherCost: getNum("otherCost"),
      disposalCost: getNum("disposalCost"), buffer: getNum("buffer"), vat: getNum("vat")
    });
  }

  function renderOperations() {
    $("operations").innerHTML = items.map(function (item, index) {
      const c = CATALOG[item.type] || CATALOG.annet;
      const id = esc(item.id);
      const detailFields = (c.fields || []).map(function (f) {
        const val = item.details[f.id];
        let control = "";
        if (f.type === "select") {
          control = '<select data-detail="' + esc(f.id) + '">' +
            f.options.map(function (o) {
              return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + '>' + esc(o[1]) + '</option>';
            }).join("") + '</select>';
        } else {
          control = '<input type="number" inputmode="decimal" min="0" max="1000" step="any" data-detail="' + esc(f.id) + '" value="' + esc(val) + '">';
        }
        return '<label class="operation-field"><span>' + esc(f.label) + '</span>' + control + '</label>';
      }).join("");
      function numField(key, label, value, step) {
        return '<label class="operation-field"><span>' + esc(label) + '</span><input type="number" inputmode="decimal" min="0" max="100000" step="' +
          (step || "any") + '" data-key="' + key + '" value="' + esc(value) + '"></label>';
      }
      const complexity = [["easy","Enkel"],["normal","Normal"],["demanding","Krevjande"],["extreme","Svært krevjande"]];
      const access = [["good","God"],["medium","Avgrensa"],["difficult","Vanskeleg"]];
      function choice(key, label, options) {
        return '<label class="operation-field"><span>' + label + '</span><select data-key="' + key + '">' +
          options.map(function (o) { return '<option value="' + o[0] + '"' + (item[key] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join("") + '</select></label>';
      }
      return '<article class="op-card" data-id="' + id + '">' +
        '<div class="op-header"><div class="op-title"><span class="op-number">' + String(index + 1).padStart(2,"0") + '</span><h3>' + esc(c.name) + '</h3></div><button type="button" class="op-remove" data-remove="' + id + '">✕ Fjern</button></div>' +
        '<div class="operation-grid">' +
          numField("quantity", "Mengde (" + c.unit + ")", item.quantity) +
          choice("complexity", "Generell vanskegrad", complexity) +
          choice("access", "Tilkomst", access) +
        '</div>' +
        (detailFields ? '<div class="op-extra-title">Opplysningar for denne jobben</div><div class="operation-grid op-extra-fields">' + detailFields + '</div>' : '') +
        '<details class="fine-tuning"><summary>Finjuster arbeidskapasitet, rigg og kostnader</summary><div class="operation-grid">' +
          numField("capacity", "Kapasitet (" + c.unit + "/t)", item.capacity) +
          numField("setup", "Rigging (timar)", item.setup) +
          numField("material", "Materialkostnad (kr/" + c.unit + ")", item.material) +
          numField("equipment", "Utstyrskostnad (kr/t)", item.equipment) +
        '</div></details>' +
        '<div class="op-preview"><span>Estimert arbeidstid inkludert rigg</span><strong data-op-hours="' + id + '">–</strong></div>' +
      '</article>';
    }).join("");
    $("operationCount").textContent = items.length + " " + (items.length === 1 ? "operasjon" : "operasjonar");
  }

  function quality(calc) {
    const notes = [];
    if (!$("projectName").value.trim()) notes.push("Gi prosjektet eit namn før bruk.");
    if (!$("address").value.trim()) notes.push("Arbeidsstad er ikkje registrert.");
    if (!$("customerName").value.trim()) notes.push("Kunde er ikkje registrert.");
    return notes.concat(ENGINE.issues(items, calc));
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
    $("copyOfferBtn").disabled = !calc.active || calc.needsVisit;
    $("printBtn").disabled = !calc.active || calc.needsVisit;
    $("copyOfferBtn").title = calc.needsVisit ? "Krev HMS-kontroll/befaring før utsending" : "";
    $("printBtn").title = calc.needsVisit ? "Krev HMS-kontroll/befaring før utsending" : "";
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
    // Risiko-/kalkylebufferen er intern og fordelast på prislinjene.
    // Kunden skal ikkje sjå interne påslag eller lønsemdstal i tilbodet.
    const quoteFactor = c.salesBeforeBuffer > 0 ? (c.salesBeforeBuffer + c.contingency) / c.salesBeforeBuffer : 1;
    const lines = c.ops.map((op) => ({ label: `${op.title} · ${format(op.quantity, op.quantity % 1 ? 1 : 0)} ${op.unit}`, sum: op.execution * getNum("saleHourly") * quoteFactor }));
    if (c.travelHours > 0) lines.push({ label: `Transport · ${format(c.travelHours, 1)} t`, sum: c.travelHours * getNum("saleHourly") * quoteFactor });
    if (c.totalMaterialCost > 0) lines.push({ label: "Material og forbruksmateriell", sum: c.totalMaterialCost * (1 + getNum("markup") / 100) * quoteFactor });
    if (c.extraCost > 0) lines.push({ label: "Levering og andre tillegg", sum: c.extraCost * (1 + getNum("markup") / 100) * quoteFactor });
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
      <div class="paper-disclaimer"><strong>Viktig:</strong> Faste standardtimesatsar frå admin, men førebelse arbeidsnormer og kostnader. Dette er ikkje eit bindande tilbod. Kontroll av omfang, materialprisar, MVA, HMS og vilkår er nødvendig før utsending.</div>`;
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
      if (values[field] !== undefined) el.value = String(values[field]).slice(0, field === "jobDescription" ? 2500 : field === "notes" ? 2000 : 180);
    }
  }

  function exportData() {
    return { version: 2, generatedAt: new Date().toISOString(), fields: Object.fromEntries(FIELD_IDS.map((key) => [key, $(key).value])), operations: items.map(({ id, ...rest }) => rest) };
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
    if (!data || ![1, 2].includes(data.version) || !data.fields || !Array.isArray(data.operations) ||
        !data.operations.length || data.operations.length > 15) throw new Error("Ugyldig kalkylefil.");
    const approved = data.operations.map(function (raw) {
      if (!raw || !CATALOG[raw.type]) throw new Error("Ukjend arbeidsoperasjon.");
      return newItem(raw.type, raw);
    });
    const validFields = {};
    for (const field of FIELD_IDS) {
      if (typeof data.fields[field] !== "string" && typeof data.fields[field] !== "number") continue;
      validFields[field] = NUMERIC_FIELDS.has(field) ? String(ENGINE.safe(data.fields[field], field === "vat" ? 25 : 10000000)) : String(data.fields[field]);
    }
    items = approved;
    setValues(validFields);
    syncRate();
    renderOperations();
    update();
    goto("scope");
  }

  function offerText(c) {
    const project = $("projectName").value.trim() || "Utan prosjektnamn";
    const customer = $("customerName").value.trim() || "Ikkje registrert";
    return [`SØRGULEN INDUSTRISERVICE – UTKAST TIL PRISTILBOD`, `Kunde: ${customer}`, `Oppdrag: ${project}`, `Stad: ${$("address").value.trim() || "Ikkje registrert"}`, "", `Beskriving: ${$("notes").value.trim() || "Sjå arbeidslinjene."}`, "", ...offerLines(c).map((l) => `${l.label}: ${money(l.sum)}`), "", `Sum eks. mva.: ${money(c.net)}`, `MVA (${getNum("vat")} %): ${money(c.vat)}`, `Total inkl. vald MVA: ${money(c.gross)}`, "", "Dette er eit ikkje-bindande estimat. Kontroll av arbeidsnormer, materialkostnader, MVA, tryggleik og vilkår er nødvendig før utsending."].join("\n");
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
