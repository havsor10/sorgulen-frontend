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
        ? `Takk for oppdraget. Her finner du oppsummeringen av prosjektet «${service}» og informasjonen som er registrert underveis.`
        : `Her kan du følge prosjektet «${service}». Jeg oppdaterer siden underveis, så du enkelt kan se hva som er gjort og hva som skjer videre.`;
      replaceIfDifferent(welcomeMessage, message);
    }

    if (statusHelp) {
      const replacements = new Map([
        ["Oppdraget er opprettet og venter på oppstart.", "Jeg har prosjektet ditt planlagt og oppdaterer siden når oppstarten nærmer seg."],
        ["Det registreres arbeid på prosjektet nå.", "Jeg jobber med prosjektet ditt nå, og registrerer arbeidstiden underveis."],
        ["Arbeidet er pauset akkurat nå.", "Jeg har pauset arbeidet midlertidig. Jeg oppdaterer siden når jeg fortsetter."],
        ["Arbeidet fortsetter ved neste arbeidsøkt.", "Jeg er fortsatt i gang med prosjektet ditt. Arbeidet fortsetter ved neste arbeidsøkt."],
        ["Oppdraget er ferdigstilt.", "Arbeidet er ferdig. Takk for oppdraget og tilliten."],
        ["Oppdraget er avsluttet.", "Oppdraget er avsluttet. Ta gjerne kontakt hvis det er noe du lurer på."],
        ["Håvard kan nå gå videre med innkjøpet.", "Takk! Jeg kan nå gå videre med innkjøpet."],
        ["Håvard oppdaterer siden når varen er klar.", "Jeg oppdaterer siden når varen er klar."],
      ]);
      const current = statusHelp.textContent.trim();
      if (replacements.has(current)) replaceIfDifferent(statusHelp, replacements.get(current));
    }

    if (nextWorkSubtext) {
      const current = nextWorkSubtext.textContent.trim();
      if (nextWorkText?.textContent.trim() === "Ikke satt ennå") {
        replaceIfDifferent(
          nextWorkSubtext,
          "Jeg har ikke satt neste arbeidsdag ennå. Prosjektet er fortsatt aktivt, og jeg oppdaterer datoen her så snart den er avklart."
        );
      } else if (current === "Denne arbeidsperioden er planlagt. Siden oppdateres dersom planen endrer seg.") {
        replaceIfDifferent(nextWorkSubtext, "Dette er perioden jeg har planlagt å komme tilbake. Jeg oppdaterer siden dersom planen endrer seg.");
      } else if (current === "Dette er forventet tidspunkt og kan endres. Siden oppdateres dersom planen endrer seg.") {
        replaceIfDifferent(nextWorkSubtext, "Dette er når jeg forventer å kunne komme tilbake. Hvis planen endrer seg, oppdaterer jeg det her.");
      }
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
