(() => {
  const projectContent = document.getElementById("projectContent");
  const customerSource = document.getElementById("customerName");
  const projectName = document.getElementById("projectName");
  const greeting = document.getElementById("personalGreeting");
  const welcomeMessage = document.getElementById("welcomeMessage");
  const statusHelp = document.getElementById("statusHelp");
  const nextWorkText = document.getElementById("nextWorkText");
  const nextWorkSubtext = document.getElementById("nextWorkSubtext");
  const updatedText = document.getElementById("updatedText");

  function firstNameFromCustomer() {
    const raw = String(customerSource?.textContent || "")
      .replace(/^For\s+/i, "")
      .trim();
    if (!raw) return "";
    return raw.split(/\s+/)[0];
  }

  function replaceIfDifferent(element, value) {
    if (element && value && element.textContent !== value) element.textContent = value;
  }

  function makeLanguagePersonal() {
    const firstName = firstNameFromCustomer();
    const service = String(projectName?.textContent || "prosjektet ditt").trim();

    if (greeting) {
      replaceIfDifferent(greeting, firstName ? `Hei ${firstName}!` : "Hei!");
    }

    if (welcomeMessage) {
      const completed = /ferdig|avsluttet/i.test(String(document.getElementById("statusText")?.textContent || ""));
      const message = completed
        ? `Takk for oppdraget. Her finner du oppsummeringen av ${service.toLowerCase()} og informasjonen som er registrert underveis.`
        : `Her kan du følge ${service.toLowerCase()}. Jeg oppdaterer siden underveis, så du enkelt kan se hva som er gjort og hva som skjer videre.`;
      replaceIfDifferent(welcomeMessage, message);
    }

    if (statusHelp) {
      const replacements = new Map([
        ["Håvard kan nå gå videre med innkjøpet.", "Takk! Jeg kan nå gå videre med innkjøpet."],
        ["Håvard oppdaterer siden når varen er klar.", "Jeg oppdaterer siden når varen er klar."],
      ]);
      const current = statusHelp.textContent.trim();
      if (replacements.has(current)) replaceIfDifferent(statusHelp, replacements.get(current));
    }

    if (nextWorkText?.textContent.trim() === "Ikke satt ennå" && nextWorkSubtext) {
      replaceIfDifferent(
        nextWorkSubtext,
        "Jeg har ikke satt neste arbeidsdag ennå. Prosjektet er fortsatt aktivt, og jeg oppdaterer datoen her så snart den er avklart."
      );
    }

    document.querySelectorAll(".approval-result p").forEach((paragraph) => {
      const current = paragraph.textContent.trim();
      if (current === "Håvard kan nå gå videre med innkjøpet.") {
        replaceIfDifferent(paragraph, "Takk! Jeg kan nå gå videre med innkjøpet.");
      }
      if (current === "Håvard oppdaterer siden når varen er klar.") {
        replaceIfDifferent(paragraph, "Jeg oppdaterer siden når varen er klar.");
      }
    });

    if (updatedText) {
      const current = updatedText.textContent.trim();
      if (current.startsWith("Sist oppdatert ")) {
        replaceIfDifferent(updatedText, current.replace(/^Sist oppdatert\s+/, "Siden sist oppdatert av Håvard "));
      }
    }
  }

  if (projectContent) {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(makeLanguagePersonal);
    });
    observer.observe(projectContent, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  makeLanguagePersonal();
})();
