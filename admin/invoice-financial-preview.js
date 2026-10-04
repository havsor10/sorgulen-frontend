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
