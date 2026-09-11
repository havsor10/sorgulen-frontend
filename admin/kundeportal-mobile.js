(() => {
  const editor = document.getElementById("portalEditor");
  const projectList = document.getElementById("projectList");

  const visibilityOptions = [
    {
      id: "showHours",
      title: "Vis total arbeidstid hittil",
      description: "Kunden ser summen av registrert arbeidstid på prosjektet så langt.",
    },
    {
      id: "showWorkHistory",
      title: "Vis arbeidsdager",
      description: "Kunden ser hvilke dager du har jobbet og registrert arbeidstid for hver dag.",
    },
    {
      id: "showImages",
      title: "Vis prosjektbilder",
      description: "Kunden ser bare bilder du selv har valgt å laste opp til prosjektportalen.",
    },
  ];

  function enhanceVisibilityRows() {
    if (!editor) return;
    visibilityOptions.forEach(({ id, title, description }) => {
      const input = editor.querySelector(`#${CSS.escape(id)}`);
      const label = input?.closest(".portal-check");
      if (!input || !label || label.dataset.mobileEnhanced === "true") return;

      label.dataset.mobileEnhanced = "true";
      label.classList.add("portal-switch-row");
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", title);

      [...label.childNodes].forEach((node) => {
        if (node !== input) node.remove();
      });

      const copy = document.createElement("span");
      copy.className = "portal-switch-copy";
      const heading = document.createElement("strong");
      heading.textContent = title;
      const help = document.createElement("small");
      help.textContent = description;
      copy.append(heading, help);
      label.insertBefore(copy, input);
    });
  }

  function removeRedundantRefresh() {
    editor?.querySelector("#refreshSelectedPortal")?.remove();
  }

  function improveEditorText() {
    if (!editor) return;
    const headings = [...editor.querySelectorAll("h3")];
    const important = headings.find((heading) => heading.textContent.trim().startsWith("2. Det viktigste kunden ser"));
    if (important) important.textContent = "2. Neste besøk og kundeoppdatering";

    const visibility = headings.find((heading) => heading.textContent.trim().startsWith("3. Hva kunden får se"));
    if (visibility) visibility.textContent = "3. Velg hva kunden får se";
  }

  function enhanceEditor() {
    removeRedundantRefresh();
    improveEditorText();
    enhanceVisibilityRows();
  }

  if (editor) {
    const observer = new MutationObserver(() => {
      requestAnimationFrame(enhanceEditor);
    });
    observer.observe(editor, { childList: true, subtree: true });
    enhanceEditor();
  }

  projectList?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-project-id]")) return;
    if (window.innerWidth > 820) return;
    window.setTimeout(() => {
      editor?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 220);
  });
})();
