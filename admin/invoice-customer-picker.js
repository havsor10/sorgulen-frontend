(() => {
  "use strict";
  const root = document.getElementById("invoiceCustomerPicker");
  if (!root) return;
  const search = document.getElementById("invoiceCustomerSearch");
  const results = document.getElementById("invoiceCustomerResults");
  const state = document.getElementById("invoiceCustomerState");
  const createButton = document.getElementById("invoiceCreateCustomer");
  const fields = {
    name: document.getElementById("custName"),
    organizationNumber: document.getElementById("custOrg"),
    phone: document.getElementById("custPhone"),
    email: document.getElementById("custEmail"),
    address: document.getElementById("custAddress"),
    postalCode: document.getElementById("custPostal"),
    city: document.getElementById("custCity")
  };
  const base = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  let requestId = 0;
  let debounce;
  window.invoiceSelectedCustomerId = null;

  function status(message, error = false) {
    state.textContent = message;
    state.classList.toggle("is-error", error);
  }
  async function api(path, options = {}) {
    const key = (localStorage.getItem("sorgulen_admin_key") || "").trim();
    if (!key) throw new Error("Logg inn før du henter eller oppretter en kunde.");
    const response = await fetch(base + path, {
      ...options,
      headers: { "Content-Type": "application/json", "x-admin-key": key, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      window.location.assign("login.html");
      throw new Error("Innloggingen må fornyes.");
    }
    if (!response.ok) {
      const error = new Error(data.error || "Kunne ikke hente kundedata.");
      error.customerId = data.customerId;
      throw error;
    }
    return data;
  }
  function selected(customer, message = "Eksisterende kundekort er valgt og blir koblet til fakturaen.") {
    if (window.invoiceSourceCustomerId) {
      status("Denne fakturaen har allerede kundekort fra oppdraget eller bestillingen.", true);
      return;
    }
    window.invoiceSelectedCustomerId = String(customer._id);
    for (const [field, input] of Object.entries(fields)) input.value = customer[field] || "";
    search.value = "";
    results.replaceChildren();
    status(customer.name + " – " + message);
    root.classList.add("has-customer");
  }
  function unlink() {
    if (!window.invoiceSelectedCustomerId) return;
    window.invoiceSelectedCustomerId = null;
    root.classList.remove("has-customer");
    status("Kundeopplysninger er endret. Velg eller opprett kundekort på nytt før du lager en fastprisfaktura.");
  }
  Object.values(fields).forEach(input => input.addEventListener("input", unlink));
  async function findCustomers(term) {
    const current = ++requestId;
    try {
      const data = await api("/admin/customers?q=" + encodeURIComponent(term) + "&limit=20");
      if (current !== requestId) return;
      results.replaceChildren();
      const customers = Array.isArray(data.customers) ? data.customers : [];
      if (!customers.length) {
        const empty = document.createElement("p");
        empty.textContent = "Ingen treff. Fyll inn kundedata nedenfor og velg «Opprett kundekort».";
        results.append(empty);
      }
      customers.forEach(customer => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "invoice-customer-result";
        const title = document.createElement("strong");
        title.textContent = customer.name || "Ukjent kunde";
        const details = document.createElement("span");
        details.textContent = [customer.phone, customer.email, customer.address].filter(Boolean).join(" · ");
        button.append(title, details);
        button.addEventListener("click", () => selected(customer));
        results.append(button);
      });
    } catch (error) {
      if (current === requestId) status(error.message, true);
    }
  }
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    const term = search.value.trim();
    requestId += 1;
    results.replaceChildren();
    if (term.length < 2) return;
    debounce = setTimeout(() => findCustomers(term), 250);
  });
  function reflectSourceCustomer() {
    const locked = Boolean(window.invoiceSourceCustomerId);
    search.disabled = locked;
    createButton.disabled = locked;
    results.replaceChildren();
    if (locked) {
      window.invoiceSelectedCustomerId = null;
      root.classList.remove("has-customer");
      status("Kunden er allerede koblet via oppdraget eller bestillingen. Eventuelle endringer gjøres på kundekortet.");
    } else if (!window.invoiceSelectedCustomerId) {
      status("Velg eksisterende kunde, eller opprett et kundekort fra feltene nedenfor.");
    }
  }
  window.addEventListener("invoice-source-customer", reflectSourceCustomer);
  reflectSourceCustomer();
  createButton.addEventListener("click", async () => {
    const customer = Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value.trim()]));
    if (!customer.name) {
      status("Fyll inn kundenavn før du oppretter kundekort.", true);
      fields.name.focus();
      return;
    }
    if (!customer.phone && !customer.email) {
      status("Fyll inn telefonnummer eller e-post for å unngå duplikate kunder.", true);
      return;
    }
    createButton.disabled = true;
    status("Oppretter kundekort …");
    try {
      const data = await api("/admin/customers", { method: "POST", body: JSON.stringify(customer) });
      selected(data.customer, "Nytt kundekort opprettet og koblet til fakturaen.");
    } catch (error) {
      if (error.customerId) {
        try {
          const existing = await api("/admin/customers/" + encodeURIComponent(error.customerId));
          selected(existing.customer, "Kundekortet fantes fra før og er valgt.");
        } catch (innerError) { status(innerError.message, true); }
      } else {
        status(error.message, true);
      }
    } finally {
      createButton.disabled = false;
    }
  });
})();
