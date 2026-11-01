/* Felles, lesande oversikt for kunde og oppdrag. Ikkje fakturakalkulator. */
(function (root, build) {
  "use strict";
  const api = build();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SorgulenCustomerLedger = api;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  function seconds(entry, now = Date.now()) {
    if (entry?.source === "manual" && number(entry.durationSeconds) > 0) return number(entry.durationSeconds);
    const start = new Date(entry?.startedAt).getTime();
    const end = entry?.endedAt ? new Date(entry.endedAt).getTime() : now;
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : 0;
  }
  function summarizeOrder(order = {}, now = Date.now()) {
    const time = order.workIntervals || [];
    const expenses = order.additionalCosts || [];
    const equipment = order.equipment || [];
    const materials = order.materials || [];
    const notes = order.projectNotes || [];
    const stoppedOrCancelled = order.status === "cancelled";
    const fixed = ["fixed", "hybrid"].includes(order.pricingMode);
    const totalSeconds = time.reduce((total, entry) => total + seconds(entry, now), 0);
    const billableSeconds = time.filter((entry) => entry.billable !== false).reduce((total, entry) => total + seconds(entry, now), 0);
    const workAmount = order.pricingMode === "fixed" ? 0 : time.reduce((total, entry) => {
      if (entry.billable === false || (entry.source !== "manual" && !entry.endedAt)) return total;
      return total + seconds(entry, now) / 3600 * number(entry.hourlyRateSnapshot ?? order.hourlyRate);
    }, 0);
    const expensesTotal = expenses.reduce((total, entry) => total + number(entry.amount), 0);
    const expensesBillable = expenses.filter((entry) => entry.billable !== false).reduce((total, entry) => total + number(entry.amount), 0);
    const equipmentTotal = equipment.reduce((total, entry) => total + number(entry.amount), 0);
    const equipmentBillable = equipment.filter((entry) => entry.billable !== false).reduce((total, entry) => total + number(entry.amount), 0);
    const materialsCost = materials.reduce((total, entry) => total + number(entry.quantity) * number(entry.purchaseUnitPrice), 0);
    const materialsTotal = materials.filter((entry) => entry.unitPrice != null).reduce((total, entry) => total + number(entry.quantity) * number(entry.unitPrice), 0);
    const materialsBillable = materials.filter((entry) => entry.billable !== false && entry.unitPrice != null).reduce((total, entry) => total + number(entry.quantity) * number(entry.unitPrice), 0);
    const missingPrices = materials.filter((entry) => entry.billable !== false && entry.unitPrice == null).length;
    const fixedAmount = fixed && number(order.fixedPrice) > 0 ? number(order.fixedPrice) : 0;
    const estimate = stoppedOrCancelled ? 0 : round(workAmount + fixedAmount + expensesBillable + equipmentBillable + materialsBillable);
    return {
      time: time.length, totalSeconds, billableSeconds, workAmount: round(workAmount),
      expenses: expenses.length, expensesTotal: round(expensesTotal), expensesBillable: round(expensesBillable),
      equipment: equipment.length, equipmentTotal: round(equipmentTotal), equipmentBillable: round(equipmentBillable),
      materials: materials.length, materialsCost: round(materialsCost),
      materialsTotal: round(materialsTotal), materialsBillable: round(materialsBillable),
      notes: notes.length, missingPrices, fixedAmount, estimate,
      count: time.length + expenses.length + equipment.length + materials.length + notes.length,
    };
  }
  function summarizeCustomer(orders = [], now = Date.now()) {
    const totals = { orders: orders.length, time: 0, totalSeconds: 0, billableSeconds: 0, workAmount: 0,
      expenses: 0, expensesTotal: 0, expensesBillable: 0, equipment: 0, equipmentTotal: 0,
      equipmentBillable: 0, materials: 0, materialsTotal: 0, materialsCost: 0,
      materialsBillable: 0, notes: 0, missingPrices: 0, fixedAmount: 0, estimate: 0, count: 0 };
    for (const order of orders) {
      const entry = summarizeOrder(order, now);
      for (const key of Object.keys(totals)) {
        if (key !== "orders") totals[key] += number(entry[key]);
      }
    }
    for (const key of ["workAmount", "expensesTotal", "expensesBillable", "equipmentTotal", "equipmentBillable", "materialsTotal", "materialsCost", "materialsBillable", "fixedAmount", "estimate"]) totals[key] = round(totals[key]);
    return totals;
  }
  return { seconds, summarizeOrder, summarizeCustomer };
});
