/* Samla arbeids- og fakturastatus. Fakturadata er lese frå /api/invoices.
   Ein faktura kan gjelde fleire oppdrag, og ei oppdragsstatus er aldri ein betalingsstatus. */
(function (root, factory) {
  "use strict";
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  if (root) root.SorgulenOrderBoard = model;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";
  const moneyNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const normId = (value) => String(value ?? "").trim();
  const openStages = new Set(["active", "paused", "stopped"]);
  const nonPaidStages = new Set(["issued", "sent"]);
  const isRealInvoice = (invoice) => invoice && !invoice.isCreditNote;
  const validInvoice = (invoice) => isRealInvoice(invoice) && ["draft", "issued", "sent", "paid", "credited"].includes(invoice.status);
  const osloDate = (date = new Date()) => {
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(parsed);
    const value = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  };
  const dueDateKey = (date) => {
    if (!date) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return String(date);
    return osloDate(date);
  };
  const isOverdue = (invoice, today = osloDate()) =>
    nonPaidStages.has(invoice?.status) && invoice.status === "sent"
    && Boolean(dueDateKey(invoice.dueDate)) && dueDateKey(invoice.dueDate) < today;
  const outstanding = (invoice) => {
    if (!nonPaidStages.has(invoice?.status)) return 0;
    const fikenOre = invoice?.fiken?.outstandingBalanceOre;
    if (invoice?.fiken?.syncStatus === "synced" && fikenOre != null && Number.isFinite(Number(fikenOre)))
      return Math.max(0, Number(fikenOre) / 100);
    return Math.max(0, moneyNumber(invoice.amount));
  };
  const inconsistentPayment = (invoice) => nonPaidStages.has(invoice?.status)
    && invoice?.fiken?.syncStatus === "synced"
    && (invoice?.fiken?.settled === true || invoice?.fiken?.outstandingBalanceOre === 0);

  function matchingOrderIds(invoice, orderIds) {
    const ids = new Set();
    if (!validInvoice(invoice)) return ids;
    const directId = normId(invoice.sourceId);
    if (invoice.sourceType === "workOrder" && orderIds.has(directId)) ids.add(directId);
    const snapshotId = normId(invoice.basisSnapshot?.workOrderId);
    if (snapshotId && orderIds.has(snapshotId)) ids.add(snapshotId);
    const projectKey = normId(invoice.projectInvoiceKey);
    const keys = invoice.sourceEntryKeys || invoice.basisSnapshot?.sourceEntryKeys || [];
    for (const id of orderIds) {
      if (projectKey === id || projectKey.startsWith("workorder-" + id + "-")) ids.add(id);
    }
    for (const key of keys) {
      const id = String(key || "").split(":", 1)[0];
      if (orderIds.has(id)) ids.add(id);
    }
    return ids;
  }

  const workStage = (order) => order?.workflow?.status || order?.status || "planned";
  const stageText = (value) => ({
    planned: "Planlagt", active: "Arbeid pågår", paused: "Arbeid pausa",
    stopped: "Mellom arbeidsøkter", completed: "Arbeid ferdig", cancelled: "Avbrutt",
  })[value] || "Ukjend arbeidsstatus";

  function invoiceLabels(invoices, today) {
    const labels = [];
    const count = (status) => invoices.filter((inv) => inv.status === status).length;
    const due = invoices.filter((inv) => isOverdue(inv, today));
    const exceptions = invoices.filter(inconsistentPayment);
    if (exceptions.length) labels.push({ key: "mismatch", label: "Kontroller Fiken-betaling", count: exceptions.length });
    if (due.length) labels.push({ key: "overdue", label: "Forfalt", count: due.length });
    const drafts = count("draft");
    if (drafts) labels.push({ key: "draft", label: "Fakturautkast", count: drafts });
    const issued = count("issued");
    if (issued) labels.push({ key: "issued", label: "Utstedt – levering må sjekkast", count: issued });
    const sent = count("sent");
    if (sent) labels.push({ key: "unpaid", label: "Sendt – ikkje registrert betalt", count: sent });
    const paid = count("paid");
    if (paid) labels.push({ key: "paid", label: "Betalt", count: paid });
    const credited = count("credited");
    if (credited) labels.push({ key: "credited", label: "Kreditert", count: credited });
    return labels;
  }

  function classify(order, linkedInvoices, unlinkedSameCustomer, today, financeAvailable) {
    const stage = workStage(order);
    const invoices = linkedInvoices.filter(validInvoice);
    const labels = financeAvailable ? invoiceLabels(invoices, today) : [];
    const find = (status) => invoices.find((inv) => inv.status === status);
    const overdue = invoices.find((inv) => isOverdue(inv, today));
    const inconsistent = invoices.find(inconsistentPayment);
    const draft = find("draft");
    const issued = find("issued");
    const sent = find("sent");
    const paid = find("paid");
    const credited = find("credited");
    const invoiceId = (inv) => normId(inv?._id);
    const toInvoice = (inv) => "faktura-detalj.html?id=" + encodeURIComponent(invoiceId(inv));
    const noFinance = { group: "unknown", priority: 0, action: "Fakturastatus ikkje henta", href: "", source: "unknown" };
    let decision;
    if (order.isTest) decision = { group: "test", priority: 90, action: "", href: "", source: "test" };
    else if (stage === "cancelled") decision = { group: "cancelled", priority: 85, action: "", href: "", source: "cancelled" };
    else if (!financeAvailable) decision = noFinance;
    else if (inconsistent) decision = { group: "attention", priority: 0, action: "Kontroller betalingsavvik i Fiken", href: toInvoice(inconsistent), source: "mismatch" };
    else if (overdue) decision = { group: "attention", priority: 1, action: "Følg opp forfalt betaling", href: toInvoice(overdue), source: "overdue" };
    else if (draft) decision = { group: "attention", priority: 2, action: "Kontroller fakturautkast", href: toInvoice(draft), source: "draft" };
    else if (issued) decision = { group: "attention", priority: 3, action: "Kontroller levering av faktura", href: toInvoice(issued), source: "issued" };
    else if (sent) decision = { group: "waiting", priority: 5, action: "Sjå faktura og betaling", href: toInvoice(sent), source: "unpaid" };
    else if (openStages.has(stage)) decision = { group: "working", priority: 10, action: "Opne oppdrag", href: "", source: "work" };
    else if (stage === "planned") decision = { group: "planned", priority: 15, action: "Opne planlagt oppdrag", href: "", source: "planned" };
    else if (stage === "completed" && paid && invoices.every((inv) => ["paid", "credited"].includes(inv.status)) && !credited)
      decision = { group: "done", priority: 50, action: "Betalt", href: toInvoice(paid), source: "paid" };
    else if (stage === "completed" && credited)
      decision = { group: "attention", priority: 4, action: "Kreditert – kontroller neste steg", href: toInvoice(credited), source: "credited" };
    else if (stage === "completed" && unlinkedSameCustomer.length)
      decision = { group: "attention", priority: 6, action: "Kontroller fakturakopling", href: "kunde.html?id=" + encodeURIComponent(normId(order.customerId)), source: "ambiguous" };
    else if (stage === "completed")
      decision = { group: "attention", priority: 5, action: "Lag fakturautkast", href: "faktura-ny.html?workOrderId=" + encodeURIComponent(normId(order._id)), source: "unbilled" };
    else decision = { group: "other", priority: 70, action: "Opne oppdrag", href: "", source: "other" };
    return {
      ...decision, workStage: stage, stageLabel: stageText(stage), labels,
      linkedInvoices: invoices.map((inv) => ({
        id: invoiceId(inv), number: inv.invoiceNumber || null, status: inv.status,
        dueDate: dueDateKey(inv.dueDate), amount: moneyNumber(inv.amount),
        outstanding: outstanding(inv), isOverdue: isOverdue(inv, today),
        paymentMismatch: inconsistentPayment(inv),
      })),
      hasMissingLink: Boolean(stage === "completed" && unlinkedSameCustomer.length && !invoices.length),
      outstanding: invoices.reduce((sum, inv) => sum + outstanding(inv), 0),
    };
  }

  function buildBoard(orders = [], invoices = [], { financeAvailable = true, now = new Date() } = {}) {
    const today = osloDate(now);
    const valid = (invoices || []).filter(validInvoice);
    const orderIds = new Set((orders || []).map((order) => normId(order._id)));
    const invoiceLinks = new Map();
    const linkedByOrder = new Map((orders || []).map((order) => [normId(order._id), []]));
    const unlinkedByCustomer = new Map();
    for (const inv of valid) {
      const ids = matchingOrderIds(inv, orderIds);
      invoiceLinks.set(normId(inv._id), ids);
      for (const id of ids) linkedByOrder.get(id)?.push(inv);
      if (!ids.size && normId(inv.customerId)) {
        const list = unlinkedByCustomer.get(normId(inv.customerId)) || [];
        list.push(inv);
        unlinkedByCustomer.set(normId(inv.customerId), list);
      }
    }
    const records = (orders || []).map((order) => {
      const id = normId(order._id);
      const finance = classify(order, linkedByOrder.get(id) || [],
        unlinkedByCustomer.get(normId(order.customerId)) || [], today, financeAvailable);
      return { id, order, finance };
    });
    records.sort((a, b) => a.finance.priority - b.finance.priority ||
      String(b.order.jobDate || "").localeCompare(String(a.order.jobDate || "")));
    const groupNames = {
      attention: "Dette må du følgje opp", waiting: "Ventar på betaling",
      working: "I arbeid", planned: "Planlagde oppdrag", done: "Ferdig og betalt",
      cancelled: "Avbrotne oppdrag", test: "Testoppdrag", unknown: "Fakturastatus ukjend", other: "Andre oppdrag",
    };
    const groups = Object.fromEntries(Object.keys(groupNames).map((name) =>
      [name, records.filter((entry) => entry.finance.group === name)]));
    const unmatchedInvoices = valid.filter((inv) => !(invoiceLinks.get(normId(inv._id))?.size)
      && ["draft", "issued", "sent"].includes(inv.status)).map((inv) => ({
        id: normId(inv._id), name: inv.customerName || "Ukjend kunde",
        number: inv.invoiceNumber || null, status: inv.status, amount: moneyNumber(inv.amount),
        outstanding: outstanding(inv), overdue: isOverdue(inv, today), dueDate: dueDateKey(inv.dueDate),
      }));
    const payableInvoices = valid.filter((inv) => nonPaidStages.has(inv.status));
    return {
      today, records, groups, groupNames, unmatchedInvoices, financeAvailable,
      summary: {
        attention: groups.attention.length, waiting: groups.waiting.length,
        working: groups.working.length, planned: groups.planned.length,
        done: groups.done.length, test: groups.test.length,
        unpaidInvoices: payableInvoices.length,
        outstanding: payableInvoices.reduce((sum, inv) => sum + outstanding(inv), 0),
        overdueInvoices: payableInvoices.filter((inv) => isOverdue(inv, today)).length,
      },
    };
  }
  return { osloDate, dueDateKey, isOverdue, outstanding, inconsistentPayment, matchingOrderIds, classify, buildBoard };
});
