/* Kalkyle Studio: deterministic job models, no external calls or AI price guessing.
   Rates are a snapshot of backend-live/utils/defaultRates.js (2026-11-04).
   All capacities/material assumptions require field calibration. */
(function (root, make) {
  "use strict";
  const api = make();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SorgulenPricing = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const RATES = Object.freeze({ own: 850, customer: 650 });
  const OPTIONS = {
    weeds: [["none", "Ingen ugras"], ["light", "Litt ugras"], ["medium", "Moderat ugras"], ["heavy", "Mykje ugras"]],
    joints: [["no", "Berre vask"], ["yes", "Etterfuging med fugesand"]],
    water: [["yes", "Vatn og straum tilgjengeleg"], ["no", "Må ordnast / manglar"]],
    pitch: [["flat", "Flatt/lågt fall"], ["normal", "Normalt takfall"], ["steep", "Bratt tak"]],
    roofHeight: [["low", "Lågt tak / trygg tilkomst"], ["high", "Arbeid i høgda, krev sikring"]],
    snow: [["light", "0–10 cm"], ["medium", "10–25 cm"], ["deep", "25–50 cm"], ["extreme", "Over 50 cm"]],
    incline: [["normal", "Flatt / normal tilkomst"], ["steep", "Bratt eller vanskeleg areal"]],
    treeSize: [["small", "Liten (under 5 m)"], ["medium", "Mellomstor (5–10 m)"], ["large", "Stor (10–15 m)"], ["verylarge", "Svært stor (over 15 m)"]],
    treeRisk: [["clear", "God avstand til bygningar og leidningar"], ["obstacles", "Bygning/gjerde eller anna hinder nær treet"], ["lines", "Straumleidningar eller andre kritiske forhold"]],
    removal: [["no", "La avkapp liggje"], ["yes", "Samle/rydd avkapp"], ["transport", "Rydd og køyr bort"]],
    roofSurface: [["tile", "Takstein"], ["metal", "Metallplater"], ["other", "Anna/ukjent taktekking"]],
    cleanup: [["no", "Ingen ekstra rydding"], ["yes", "Rydding inkludert"]],
    hardSurface: [["normal", "Normal tilsmussing"], ["heavy", "Kraftig tilsmussing"]],
    maintenance: [["normal", "Normal vegetasjon"], ["overgrown", "Kraftig gjengrodd"]],
    floors: [["low", "1 etasje / lett tilgang"], ["high", "2+ etasjar / krev kontroll"]]
  };
  function select(id, title, group, value) {
    return { id: id, label: title, type: "select", options: OPTIONS[group], default: value };
  }
  function number(id, title, value, unit) {
    return { id: id, label: title, type: "number", default: value, unit: unit || "" };
  }
  const CATALOG = Object.freeze({
    brostein: {
      name: "Vask av brostein", unit: "m²", capacity: 22, setup: 0.75, material: 2, equipment: 65,
      fields: [select("weeds", "Mengd ugras", "weeds", "medium"), select("joints", "Etterfuging", "joints", "no"), number("stairs", "Trappetrinn / kantsoner", 0, "trinn"), select("water", "Vatn og straum", "water", "yes")]
    },
    takvask: {
      name: "Takvask / fjerning av mose", unit: "m²", capacity: 15, setup: 1.5, material: 5, equipment: 110,
      fields: [select("pitch", "Takhelling", "pitch", "normal"), select("roofHeight", "Høgd og sikring", "roofHeight", "high"), select("roofSurface", "Taktekking", "roofSurface", "tile")]
    },
    broyting: {
      name: "Brøyting / snørydding", unit: "m²", capacity: 850, setup: 0.35, material: 0, equipment: 150,
      fields: [select("snow", "Snødjupn", "snow", "medium"), select("incline", "Terreng og tilkomst", "incline", "normal"), number("handArea", "Areal som må måkast for hand", 0, "m²")]
    },
    trefelling: {
      name: "Trefelling / kapping av tre", unit: "tre", capacity: 0.7, setup: 0.75, material: 0, equipment: 90,
      fields: [select("treeSize", "Storleik på trea", "treeSize", "medium"), select("treeRisk", "Hindringar og risiko", "treeRisk", "clear"), select("removal", "Kvisting og bortkøyring", "removal", "no")]
    },
    plenklipp: {
      name: "Plenklipping", unit: "m²", capacity: 450, setup: 0.30, material: 0, equipment: 42,
      fields: [select("maintenance", "Kor grodd er plenen?", "maintenance", "normal"), select("cleanup", "Oppsamling", "cleanup", "no")]
    },
    kantklipp: {
      name: "Kantklipping", unit: "meter", capacity: 130, setup: 0.30, material: 0, equipment: 28,
      fields: [select("maintenance", "Vegetasjon", "maintenance", "normal")]
    },
    hekk: {
      name: "Hekk- og buskeklipping", unit: "meter", capacity: 11, setup: 0.50, material: 0, equipment: 32,
      fields: [select("maintenance", "Tilstand", "maintenance", "normal"), select("removal", "Avfall", "removal", "no")]
    },
    takrenne: {
      name: "Reinsing av takrenner", unit: "meter", capacity: 14, setup: 0.50, material: 0, equipment: 25,
      fields: [select("floors", "Høgd / tilgang", "floors", "low")]
    },
    fasadevask: {
      name: "Fasade- og husvask", unit: "m²", capacity: 30, setup: 0.70, material: 5, equipment: 60,
      fields: [select("hardSurface", "Tilsmussing", "hardSurface", "normal"), select("floors", "Høgd / tilkomst", "floors", "low")]
    },
    terrasse: {
      name: "Vask av terrasse / platting", unit: "m²", capacity: 28, setup: 0.60, material: 3, equipment: 60,
      fields: [select("hardSurface", "Tilsmussing", "hardSurface", "normal")]
    },
    vindusvask: {
      name: "Vindusvask", unit: "vindauge", capacity: 8, setup: 0.40, material: 3, equipment: 16,
      fields: [select("floors", "Tilgang", "floors", "low")]
    },
    rydding: {
      name: "Rydding / bortkøyring", unit: "m³", capacity: 1.8, setup: 0.50, material: 0, equipment: 35,
      fields: [select("removal", "Levering og transport", "removal", "transport")]
    },
    maling: {
      name: "Maling og vedlikehald", unit: "m²", capacity: 6, setup: 0.75, material: 35, equipment: 25,
      fields: [select("floors", "Tilkomst", "floors", "low"), number("coats", "Tal strøk", 2, "strøk")]
    },
    annet: {
      name: "Anna arbeid – manuelt estimat", unit: "timeverk", capacity: 1, setup: 0, material: 0, equipment: 0,
      fields: []
    }
  });
  const COMPLEXITY = Object.freeze({ easy: 0.85, normal: 1, demanding: 1.35, extreme: 1.7 });
  const ACCESS = Object.freeze({ good: 1, medium: 1.15, difficult: 1.4 });

  function safe(v, max) {
    const num = Number(v);
    return Number.isFinite(num) ? Math.max(0, Math.min(max || 1e7, num)) : 0;
  }
  function detailDefaults(type) {
    const c = CATALOG[type] || CATALOG.annet;
    const details = {};
    c.fields.forEach(function (field) { details[field.id] = field.default; });
    return details;
  }
  function makeItem(type, values) {
    type = CATALOG[type] ? type : "annet";
    const c = CATALOG[type];
    const v = values || {};
    const details = detailDefaults(type);
    (c.fields || []).forEach(function (f) {
      const given = v.details && v.details[f.id];
      if (f.type === "select" && f.options.some(function (o) { return o[0] === given; })) details[f.id] = given;
      if (f.type === "number" && given !== undefined) details[f.id] = safe(given, 1000);
    });
    return {
      type: type, quantity: safe(v.quantity || 0, 100000),
      complexity: COMPLEXITY[v.complexity] ? v.complexity : "normal",
      access: ACCESS[v.access] ? v.access : "good",
      capacity: v.capacity === undefined ? c.capacity : Math.max(0.01, safe(v.capacity, 100000)),
      setup: v.setup === undefined ? c.setup : safe(v.setup, 100),
      material: v.material === undefined ? c.material : safe(v.material, 100000),
      equipment: v.equipment === undefined ? c.equipment : safe(v.equipment, 100000),
      details: details
    };
  }
  function operation(v) {
    const c = CATALOG[v.type] || CATALOG.annet, q = safe(v.quantity, 100000);
    const d = Object.assign(detailDefaults(v.type), v.details || {});
    if (!q) return { title: c.name, unit: c.unit, quantity: q, execution: 0, material: 0, equipment: 0, missing: true };
    let work = q / Math.max(0.01, safe(v.capacity, 100000));
    let extraHours = 0, additionalMaterial = 0;
    if (v.type === "brostein") {
      const factors = { none: 1, light: 1.12, medium: 1.4, heavy: 2.15 };
      work *= factors[d.weeds] || 1.4;
      if (d.joints === "yes") { extraHours += q / 48; additionalMaterial += q * 12; }
      extraHours += safe(d.stairs, 200) * 0.20;
    }
    if (v.type === "takvask") {
      work *= ({ flat: 1, normal: 1.45, steep: 2.2 })[d.pitch] || 1.45;
      if (d.roofHeight === "high") work *= 1.2;
    }
    if (v.type === "broyting") {
      work *= ({ light: 0.65, medium: 1, deep: 1.85, extreme: 3 })[d.snow] || 1;
      if (d.incline === "steep") work *= 1.4;
      extraHours += safe(d.handArea, 5000) / 35;
    }
    if (v.type === "trefelling") {
      work *= ({ small: 0.65, medium: 1, large: 1.9, verylarge: 3.5 })[d.treeSize] || 1;
      work *= ({ clear: 1, obstacles: 2, lines: 3 })[d.treeRisk] || 1;
      if (d.removal === "yes") extraHours += q * 0.55;
      if (d.removal === "transport") extraHours += q * 1;
    }
    if (["plenklipp", "kantklipp", "hekk"].includes(v.type) && d.maintenance === "overgrown") work *= 1.6;
    if (v.type === "plenklipp" && d.cleanup === "yes") work *= 1.2;
    if (v.type === "hekk" && d.removal === "yes") work *= 1.3;
    if (v.type === "hekk" && d.removal === "transport") work *= 1.6;
    if (["terrasse", "fasadevask"].includes(v.type) && d.hardSurface === "heavy") work *= 1.6;
    if (["fasadevask", "takrenne", "vindusvask", "maling"].includes(v.type) && d.floors === "high") work *= 1.4;
    if (v.type === "maling") work *= Math.max(1, safe(d.coats, 5));
    const execution = (work + extraHours) * (COMPLEXITY[v.complexity] || 1) * (ACCESS[v.access] || 1) + safe(v.setup, 100);
    const material = q * safe(v.material, 100000) + additionalMaterial;
    return { title: c.name, unit: c.unit, quantity: q, execution: execution, material: material, equipment: execution * safe(v.equipment, 100000), missing: false };
  }
  function calculate(items, options) {
    const opts = options || {}, selected = Array.isArray(items) ? items : [];
    const rateMode = opts.rateMode === "customer" ? "customer" : "own";
    const rate = RATES[rateMode];
    const ops = selected.map(function (item) {
      const x = operation(item);
      x.id = item.id || "";
      x.type = item.type;
      return x;
    });
    const active = ops.some(function (op) { return !op.missing; });
    const executionHours = ops.reduce(function (s, op) { return s + op.execution; }, 0);
    const travelHours = active ? safe(opts.travelMinutes, 10000) / 60 : 0;
    const totalHours = executionHours + travelHours;
    const totalMaterialCost = ops.reduce(function (s, op) { return s + op.material; }, 0);
    const equipmentCost = ops.reduce(function (s, op) { return s + op.equipment; }, 0);
    const extraCost = active ? safe(opts.otherCost) + safe(opts.disposalCost) : 0;
    const internalLaborCost = totalHours * safe(opts.costHourly, 100000);
    const costs = internalLaborCost + equipmentCost + totalMaterialCost + extraCost;
    const laborSale = totalHours * rate;
    const extrasSale = (totalMaterialCost + extraCost) * (1 + safe(opts.markup, 500) / 100);
    const salesBeforeBuffer = laborSale + extrasSale;
    const contingency = salesBeforeBuffer * safe(opts.buffer, 100) / 100;
    const net = active ? Math.ceil((salesBeforeBuffer + contingency - 1e-8) / 10) * 10 : 0;
    const vat = net * safe(opts.vat, 25) / 100;
    const profit = net - costs;
    const margin = net > 0 ? profit / net * 100 : 0;
    const risk = selected.some(function (x) { return x.type === "takvask" || x.type === "trefelling"; });
    const complex = selected.some(function (x) { return x.complexity === "extreme" || x.access === "difficult"; });
    const variance = (laborSale + extrasSale) * (risk ? 0.35 : complex ? 0.28 : 0.18);
    const rangeLow = active ? Math.max(0, Math.floor((net - variance) / 10) * 10) : 0;
    const rangeHigh = active ? Math.ceil((net + variance) / 10) * 10 : 0;
    const needsVisit = selected.some(function (x) {
      const d = x.details || {};
      return x.type === "takvask" || x.type === "trefelling" || (x.type === "broyting" && d.incline === "steep") || (x.type === "takrenne" && d.floors === "high") || (x.type === "fasadevask" && d.floors === "high");
    });
    return { ops: ops, rate: rate, rateMode: rateMode, active: active, executionHours: executionHours,
      travelHours: travelHours, totalHours: totalHours, totalMaterialCost: totalMaterialCost,
      equipmentCost: equipmentCost, extraCost: extraCost, internalLaborCost: internalLaborCost,
      costs: costs, laborSale: laborSale, extrasSale: extrasSale, salesBeforeBuffer: salesBeforeBuffer,
      contingency: contingency, net: net, vat: vat, gross: net + vat, profit: profit, margin: margin,
      rangeLow: rangeLow, rangeHigh: rangeHigh, needsVisit: needsVisit };
  }
  function infer(text) {
    const raw = String(text || "").slice(0, 2500);
    const t = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a");
    const found = [];
    function hit(type, pattern) { if (pattern.test(t)) found.push(type); }
    hit("brostein", /brostein|belegningsstein|steinheller|heller.*(?:vask|rens)|(?:vask|rens).*heller/);
    hit("takrenne", /takrenne|takrenner|renser.*takren/);
    hit("takvask", /takvask|takrens(?!enne)|takstein.*(?:vask|rens)|(?:vask|rengjor|rense|mose).*tak(?!renn)|mose.*tak/);
    hit("broyting", /broyting|broyte|snorydd|snomak|moke sno|broyt/);
    hit("trefelling", /trefell|felle (?:et )?(?:\d+\s*)?tre|felling av (?:\d+\s*)?tre|hogge tre|kappe (?:av )?(?:\d+\s*)?tre|kapping av (?:\d+\s*)?tr|motorsag/);
    hit("plenklipp", /plenklipp|gressklipp|gras(s)?klipp|klipp.*plen/);
    hit("kantklipp", /kantklipp|kanttrim/);
    hit("hekk", /hekk|buskklipp|beskj[aæ]r.*busk/);
    hit("fasadevask", /fasadevask|husvask|vask.*fasade|vaske.*husvegg/);
    hit("terrasse", /terrassevask|platting|vask.*terrasse/);
    hit("vindusvask", /vindusvask|vinduspuss|vaske.*vindu/);
    hit("rydding", /bortkjoring|ryddearbeid|avfallshenting|soppel|hente.*avfall/);
    hit("maling", /maling|male.*hus|male.*vegg|beise/);
    const sqm = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kvm|m2|m²|kvadrat(?:meter)?)/);
    const metres = t.match(/(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
    const countTrees = t.match(/(\d+)\s*(?:tr(?:aer|ær|er|ar)|tre(?:et)?\b)/);
    const cm = t.match(/(\d+(?:[.,]\d+)?)\s*(?:cm)\b/);
    const amount = function (m) { return m ? safe(Number(m[1].replace(",", ".")), 100000) : 0; };
    const qtyArea = amount(sqm), qtyM = amount(metres), qtyT = amount(countTrees), snowCm = amount(cm);
    const items = (found.length ? found : ["annet"]).map(function (type, i) {
      const value = ["brostein", "takvask", "broyting", "plenklipp", "fasadevask", "terrasse", "maling"].includes(type) ? qtyArea :
        type === "trefelling" ? qtyT : ["kantklipp", "hekk", "takrenne"].includes(type) ? qtyM :
        type === "rydding" && /m3|m³/.test(t) ? amount(t.match(/(\d+(?:[.,]\d+)?)\s*m[³3]/)) : 0;
      const quantity = i === 0 ? value : (found.length > 1 ? 0 : value);
      const result = makeItem(type, { quantity: quantity });
      if (type === "brostein") {
        if (/mye|mykje|masse|kraftig|veldig mye|sv[aæ]rt mye/.test(t) && /ugras|ugress/.test(t)) result.details.weeds = "heavy";
        else if (/lite|litt|noe/.test(t) && /ugras|ugress/.test(t)) result.details.weeds = "light";
        else if (/uten ugras|uten ugress|ingen ugras|ingen ugress/.test(t)) result.details.weeds = "none";
        if (/fugesand|fuge p[aå] nytt|etterfug|ny fuging/.test(t)) result.details.joints = "yes";
        const steps = t.match(/(\d+)\s*(?:trinn|trappetrinn)/);
        if (steps) result.details.stairs = amount(steps);
      }
      if (type === "broyting") {
        if (snowCm > 50) result.details.snow = "extreme";
        else if (snowCm > 25) result.details.snow = "deep";
        else if (snowCm > 10) result.details.snow = "medium";
        else if (snowCm > 0) result.details.snow = "light";
      }
      if (type === "trefelling") {
        if (/straumlin|stromlin|kraftleidning|kraftlinj/.test(t)) result.details.treeRisk = "lines";
        else if (/hus|bygning|gjerde|naer|inntil/.test(t)) result.details.treeRisk = "obstacles";
        if (/kjor.*bort|bortkjor|transport/.test(t)) result.details.removal = "transport";
        else if (/rydde|kvist/.test(t)) result.details.removal = "yes";
      }
      if (["brostein", "takvask", "terrasse", "fasadevask"].includes(type) && /d[aå]rlig tilkomst|vanskelig tilkomst/.test(t)) result.access = "difficult";
      return result;
    });
    return {
      items: items, detected: found, measured: !!(qtyArea || qtyM || qtyT),
      message: found.length
        ? "Fann " + found.length + " type(r) arbeid. Kontroller mengder og dei spesifikke spørsmåla under."
        : "Fann ingen sikker arbeidskategori. Bruk manuell kalkyle, eller vel ein kategori frå lista."
    };
  }
  function issues(items, c) {
    const notes = [];
    if (!c.active) notes.push("Registrer areal, tal eller timeverk før prisen kan bereknast.");
    if (items.some(function (i) { return !safe(i.quantity, 100000); })) notes.push("Éin eller fleire arbeidsoperasjonar manglar mengd.");
    if (c.active && c.margin < 15) notes.push("Låg berekna margin. Kontroller kostnader og satsar.");
    if (items.some(function (i) { return i.type === "takvask"; })) notes.push("Takvask krev kontroll av taktekking, sikker tilkomst, fallrisiko og eventuelt sikringsutstyr. Pris er berre indikativ til dette er avklart.");
    if (items.some(function (i) { return i.type === "trefelling"; })) notes.push("Trefelling krev vurdering av fallretning, tryggleik, avstand til bygg og leidningar, samt kompetanse og utstyr.");
    if (items.some(function (i) { return i.type === "brostein" && i.details && i.details.water === "no"; })) notes.push("Vatn/straum manglar: registrer løysing og ekstra rigg-/transportkostnad.");
    if (items.some(function (i) { return i.type === "annet"; })) notes.push("Anna arbeid krev manuelt vurdert timetal og kostnader.");
    if (items.some(function (i) { return i.type === "trefelling" && i.details && i.details.treeRisk === "lines"; })) notes.push("Nær straumleidningar: ikkje gjennomfør eller gi bindande tilbod utan avklaring med netteigar og kvalifisert fagpersonell.");
    if (c.needsVisit) notes.push("Befaring/HMS-vurdering er nødvendig før bindande tilbod.");
    notes.push("Faste timesatsar er henta frå backend sine standardsatsar; material- og produktivitetsnormer er førebelse og må kalibrerast.");
    return notes;
  }
  return { CATALOG: CATALOG, RATES: RATES, COMPLEXITY: COMPLEXITY, ACCESS: ACCESS, makeItem: makeItem,
    calculate: calculate, infer: infer, issues: issues, safe: safe };
});
