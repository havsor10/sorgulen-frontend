(() => {
  window.createInvoiceFinancialPreview = ({ endpoint, headers, payload, render, pending, error }) => {
    let generation = 0;
    let timer;
    let controller;
    return () => {
      const current = ++generation;
      clearTimeout(timer);
      controller?.abort();
      pending();
      timer = setTimeout(async () => {
        controller = new AbortController();
        const active = controller;
        const timeout = setTimeout(() => active.abort(), 15000);
        try {
          const response = await fetch(endpoint, { method: "POST", headers: headers(),
            body: JSON.stringify(payload()), signal: active.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Kunne ikke beregne fakturasummen.");
          if (current === generation) render(data.financials);
        } catch (failure) {
          if (current === generation) error(failure.name === "AbortError" ? "Beregningen tok for lang tid. Prøv igjen." : failure.message);
        } finally { clearTimeout(timeout); }
      }, 200);
    };
  };
})();

// Display normalized line amounts returned by the same authority as the totals.
window.renderInvoiceLineFinancials = function (body, lines) {
  const rows = Array.from(body.querySelectorAll("tr"));
  rows.forEach(row => { row.querySelector(".line-total").textContent = "–"; });
  const included = rows.filter(row => row.querySelector(".line-item").value.trim());
  if (!Array.isArray(lines) || lines.length !== included.length) return;
  const format = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  included.forEach((row, index) => {
    const amount = Number(lines[index].amount);
    if (Number.isFinite(amount)) row.querySelector(".line-total").textContent = `${format.format(amount)} kr`;
  });
};
