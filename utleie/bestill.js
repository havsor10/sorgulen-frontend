(function () {
  "use strict";
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const byId = function (id) { return document.getElementById(id); };
  const match = window.location.pathname.match(/\/utleie\/bestill\/([a-z0-9-]+)\/?$/i);
  const slug = (match ? match[1] : new URLSearchParams(location.search).get("produkt") || "").toLowerCase();
  const el = {
    loading: byId("rentalLoading"), error: byId("rentalError"), layout: byId("rentalLayout"),
    heading: byId("rentalHeading"), name: byId("rentalProductName"), image: byId("rentalImage"),
    prices: byId("rentalPrices"), link: byId("rentalProductLink"),
    form: byId("rentalForm"), start: byId("rentalStart"), end: byId("rentalEnd"),
    quantity: byId("rentalQuantity"), quantityLabel: byId("rentalQuantityLabel"),
    calendar: byId("rentalCalendarStatus"), quote: byId("rentalQuote"),
    quoteNote: byId("rentalQuoteNote"), submit: byId("rentalSubmit"),
    message: byId("rentalFormMessage"), consent: byId("rentalConsent"),
    success: byId("rentalSuccess"), successText: byId("rentalSuccessText"),
  };
  // Design-forhåndsvisning på Netlifys PR-domene; kan aldri sende ekte forespørsler.
  const demoMode = /^deploy-preview-\d+--/.test(location.hostname) &&
    new URLSearchParams(location.search).get("demo") === "1";

  async function demoProductFromPage() {
    const response = await fetch("/utleie/" + encodeURIComponent(slug) + ".html");
    if (!response.ok) throw new Error("Kunne ikkje hente produkt for førehandsvising.");
    const html = await response.text();
    const page = new DOMParser().parseFromString(html, "text/html");
    const name = page.querySelector(".product-panel h1");
    if (!name) throw new Error("Dette produktet har ikkje ei fast produktside.");
    function price(text) {
      const numbers = String(text || "").replace(/[^0-9]/g, "");
      return numbers ? Number(numbers) : null;
    }
    const titles = { Dagleie: "day", Helgeleie: "weekend", Ukesleie: "week" };
    const prices = {};
    page.querySelectorAll(".price-card").forEach(function (card) {
      const key = titles[card.querySelector("small")?.textContent.trim()];
      if (key) prices[key] = price(card.querySelector("strong")?.textContent);
    });
    const variants = Array.from(page.querySelectorAll(".variant-price-table tbody tr")).map(function (tr, index) {
      const cells = Array.from(tr.querySelectorAll("td"));
      if (cells.length < 4) return null;
      return { quantity: index + 1,
        prices: { day: price(cells[1].textContent), weekend: price(cells[2].textContent), week: price(cells[3].textContent) } };
    }).filter(Boolean);
    if (variants.length) Object.assign(prices, variants[0].prices);
    const image = page.querySelector(".product-main-image")?.getAttribute("src");
    const imageUrl = image ? new URL(image, new URL("/utleie/" + slug + ".html", location.origin)).pathname : "/assets/logo.png";
    return {
      slug: slug, title: name.textContent.trim(), capacity: variants.length || 1,
      prices: prices, variants: variants, imageUrl: imageUrl,
      productUrl: "/utleie/" + slug + ".html",
    };
  }

  let product = null;
  let available = false;
  let checking = 0;
  let sending = false;

  function osloToday() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const value = function (key) { return parts.find(function (p) { return p.type === key; }).value; };
    return value("year") + "-" + value("month") + "-" + value("day");
  }
  function addDays(iso, days) {
    const date = new Date(iso + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function dayOfWeek(iso) {
    return new Date(iso + "T00:00:00Z").getUTCDay();
  }
  function periodType() {
    return el.form.querySelector('input[name="periodType"]:checked').value;
  }
  function quantity() {
    return Number(el.quantity.value || 1);
  }
  function currency(value) {
    return Number(value).toLocaleString("nb-NO") + " kr";
  }
  function setMessage(message) {
    el.message.textContent = message || "";
    el.message.hidden = !message;
  }
  function setCalendar(message, good) {
    el.calendar.textContent = message;
    el.calendar.className = "rental-info" + (good === true ? " rental-success-status" : good === false ? " rental-error" : "");
  }
  function lockSend() {
    el.submit.disabled = !available || sending || !product;
  }
  function rate() {
    if (!product) return null;
    const variant = (product.variants || []).find(function (v) { return v.quantity === quantity(); });
    const prices = variant ? variant.prices : product.prices || {};
    const n = prices[periodType()];
    return Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null;
  }
  function updateQuote() {
    const price = rate();
    el.quote.textContent = price != null ? currency(price) : "Pris etter avtale";
    el.quoteNote.textContent = price != null
      ? "Pris for vald leigepakke. Eventuelle tillegg og utlevering blir avtalt før endeleg stadfesting."
      : "Vi avtalar pris og praktiske detaljar før førespurnaden blir stadfesta.";
  }
  function showPrices() {
    el.prices.replaceChildren();
    const prices = product.prices || {};
    const labels = [["day", "Dagleie"], ["weekend", "Helgeleie"], ["week", "Ukesleie"]];
    labels.forEach(function (pair) {
      const price = prices[pair[0]];
      if (!(Number(price) > 0)) return;
      const row = document.createElement("div");
      row.className = "rental-price-row";
      const label = document.createElement("span");
      label.textContent = pair[1] + (product.variants && product.variants.length ? " frå (1 drill)" : "");
      const value = document.createElement("strong");
      value.textContent = currency(price);
      row.append(label, value);
      el.prices.appendChild(row);
    });
    if (!el.prices.children.length) {
      const note = document.createElement("p");
      note.className = "rental-muted";
      note.textContent = product.priceNote || "Pris avtalast før bestilling.";
      el.prices.appendChild(note);
    }
    el.quantityLabel.hidden = product.capacity <= 1;
    el.quantity.replaceChildren();
    for (let i = 1; i <= Math.min(3, product.capacity); i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = i + (i === 1 ? " drill" : " driller");
      el.quantity.appendChild(option);
    }
    updateQuote();
  }
  function adjustDates() {
    const type = periodType();
    const start = el.start.value;
    el.end.readOnly = type !== "other";
    if (!start) { el.end.value = ""; return; }
    if (type === "weekend" && dayOfWeek(start) !== 5) {
      el.start.value = addDays(start, (5 - dayOfWeek(start) + 7) % 7);
    }
    if (type === "day") el.end.value = el.start.value;
    else if (type === "weekend") el.end.value = addDays(el.start.value, 2);
    else if (type === "week") el.end.value = addDays(el.start.value, 6);
    else if (!el.end.value || el.end.value < el.start.value) el.end.value = el.start.value;
    el.end.min = el.start.value;
  }
  function datesValid() {
    const start = el.start.value;
    const end = el.end.value;
    if (!start || !end || start > end || start < osloToday()) return false;
    const days = Math.round((new Date(end + "T00:00:00Z") - new Date(start + "T00:00:00Z")) / 86400000) + 1;
    if (days < 1 || days > 60) return false;
    const type = periodType();
    return type === "other" || (type === "day" && days === 1) ||
      (type === "week" && days === 7) || (type === "weekend" && days === 3 && dayOfWeek(start) === 5);
  }
  async function checkAvailability() {
    if (demoMode) {
      available = false;
      lockSend();
      updateQuote();
      return;
    }
    const current = ++checking;
    available = false;
    lockSend();
    setMessage("");
    updateQuote();
    if (!datesValid()) {
      setCalendar("Velg gyldige datoer. Du kan forespørre inntil 60 dager om gongen.", false);
      return;
    }
    setCalendar("Kontrollerer leigekalenderen …");
    try {
      const qs = new URLSearchParams({
        startDate: el.start.value, endDate: el.end.value,
        periodType: periodType(), quantity: String(quantity()),
      });
      const response = await fetch(API_BASE + "/rentals/" + encodeURIComponent(slug) + "/availability?" + qs.toString());
      const data = await response.json().catch(function () { return {}; });
      if (current !== checking) return;
      if (!response.ok) throw new Error(data.error || "Kan ikkje kontrollere datoane akkurat no.");
      available = data.available === true;
      setCalendar(available
        ? "Utstyret er ledig i kalenderen for vald periode. Førespurnaden må framleis godkjennast."
        : "Utstyret er allereie reservert i heile eller delar av perioden. Vel andre datoar.", available);
      lockSend();
    } catch (error) {
      if (current !== checking) return;
      available = false;
      setCalendar(error.message || "Kunne ikkje kontrollere tilgjengelegheit.", false);
      lockSend();
    }
  }

  async function loadProduct() {
    if (!/^[a-z0-9-]{1,160}$/.test(slug)) throw new Error("Du må velje eit utleigeprodukt.");
    if (demoMode) {
      product = await demoProductFromPage();
    } else {
      const response = await fetch(API_BASE + "/rentals/" + encodeURIComponent(slug));
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.product) throw new Error(data.error || "Produktet er ikkje tilgjengeleg.");
      product = data.product;
    }
    el.loading.hidden = true;
    el.layout.hidden = false;
    el.heading.textContent = "Bestill " + product.title;
    el.name.textContent = product.title;
    document.title = "Bestill " + product.title + " | Sørgulen Industriservice";
    el.image.alt = product.title;
    const url = String(product.imageUrl || "");
    if (url.startsWith("/") || /^https:\/\//i.test(url)) el.image.src = url;
    el.link.href = String(product.productUrl || "").startsWith("/utleie/") ? product.productUrl : "/utleie/";
    showPrices();
    if (!el.start.value) el.start.value = osloToday();
    adjustDates();
    if (demoMode) {
      el.heading.textContent = "Førehandsvising – " + product.title;
      setCalendar("FØREHANDSVISING: Dette viser berre utforming, datoar og prisar. Kalender, innsending og e-post er ikkje aktive i demoen.");
      el.submit.textContent = "Kun førehandsvising – innsending deaktivert";
      el.submit.disabled = true;
      return;
    }
    checkAvailability();
  }

  el.form.querySelectorAll('input[name="periodType"]').forEach(function (input) {
    input.addEventListener("change", function () {
      adjustDates();
      checkAvailability();
    });
  });
  el.start.addEventListener("change", function () {
    adjustDates();
    checkAvailability();
  });
  el.end.addEventListener("change", checkAvailability);
  el.quantity.addEventListener("change", function () {
    updateQuote();
    checkAvailability();
  });
  el.form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (demoMode || sending || !product) return;
    if (!datesValid() || !available) {
      setMessage("Vel gyldige og ledige datoar først.");
      return;
    }
    if (!el.form.reportValidity() || !el.consent.checked) {
      setMessage("Fyll inn kontaktinformasjon og stadfest at du har lese vilkåra.");
      return;
    }
    const customerName = byId("rentalCustomerName").value.trim();
    const customerPhone = byId("rentalPhone").value.trim();
    const customerEmail = byId("rentalEmail").value.trim();
    if (!customerName || !customerPhone || !customerEmail) {
      setMessage("Fyll inn namn, telefon og e-post.");
      return;
    }
    sending = true;
    lockSend();
    el.submit.textContent = "Sender førespurnad …";
    setMessage("");
    try {
      const response = await fetch(API_BASE + "/rentals/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug: product.slug, periodType: periodType(), quantity: quantity(),
          startDate: el.start.value, endDate: el.end.value,
          customerName, customerPhone, customerEmail,
          customerNote: byId("rentalNote").value.trim(),
        }),
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) {
        if (response.status === 409) await checkAvailability();
        throw new Error(data.error || "Vi fekk ikkje registrert førespurnaden. Prøv igjen.");
      }
      el.layout.hidden = true;
      el.success.hidden = false;
      el.successText.textContent = product.title + " · " + el.start.value + " til " + el.end.value +
        " · Referanse " + (data.reference || "");
      el.success.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setMessage(error.message || "Noko gjekk gale. Prøv igjen.");
    } finally {
      sending = false;
      el.submit.textContent = "Send leieforespørsel";
      lockSend();
    }
  });
  const today = osloToday();
  el.start.min = today;
  el.start.max = addDays(today, 365);
  el.end.min = today;
  el.end.max = addDays(today, 425);
  loadProduct().catch(function (error) {
    el.loading.hidden = true;
    el.layout.hidden = true;
    el.error.textContent = error.message || "Kunne ikkje hente produktet. Prøv igjen seinare.";
    el.error.hidden = false;
  });
}());
