(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const ADMIN_KEY = "sorgulen_admin_key";
  const SENT_KEY = "sorgulen_snow_on_the_way_v1";
  const nextCard = document.getElementById("nextJobCard");
  if (!nextCard) return;

  function sentIds() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]")); }
    catch { return new Set(); }
  }

  function remember(id) {
    const values = sentIds();
    values.add(String(id));
    try { sessionStorage.setItem(SENT_KEY, JSON.stringify([...values].slice(-100))); } catch (_) {}
  }

  function etaFromCard() {
    const match = String(nextCard.textContent || "").match(/ca\.\s*(\d+)\s*min\s*kjøring/i);
    return match ? Number(match[1]) : null;
  }

  async function markOnTheWay(button, snowJobId) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "SENDER…";
    try {
      const response = await fetch(`${API}/admin/direct-job/snow-jobs/${encodeURIComponent(snowJobId)}/on-the-way`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": (localStorage.getItem(ADMIN_KEY) || "").trim(),
        },
        body: JSON.stringify({ etaMinutes: etaFromCard() }),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem(ADMIN_KEY);
        location.href = "login.html";
        return;
      }
      if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
      if (!data?.linked) {
        button.textContent = "INGEN NETTPORTAL";
        button.title = data?.reason || "Denne kunden har ingen direkte Min jobb-lenke.";
        return;
      }
      remember(snowJobId);
      button.textContent = "PÅ VEI SENDT ✓";
      button.classList.add("snow-on-way-sent");
      button.title = "Kundens Min jobb-side viser nå at du er på vei.";
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      button.title = error.message || "Kunne ikke sende På vei-status.";
      alert(error.message || "Kunne ikke sende På vei-status til kunden.");
    }
  }

  function enhance() {
    const start = nextCard.querySelector("[data-start-job]");
    if (!start) return;
    const id = start.dataset.startJob;
    if (!id || nextCard.querySelector(`[data-on-the-way-job="${CSS.escape(id)}"]`)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "snow-secondary";
    button.dataset.onTheWayJob = id;
    const alreadySent = sentIds().has(String(id));
    button.textContent = alreadySent ? "PÅ VEI SENDT ✓" : "PÅ VEI";
    button.disabled = alreadySent;
    if (alreadySent) button.classList.add("snow-on-way-sent");
    button.addEventListener("click", () => markOnTheWay(button, id));
    start.parentElement?.insertBefore(button, start);
  }

  new MutationObserver(() => queueMicrotask(enhance)).observe(nextCard, { childList: true, subtree: true });
  enhance();
})();
