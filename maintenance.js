// Vedlikeholdsskript for Sørgulen Industriservice.
// Når denne filen lastes inn på siden, vises et overlegg med informasjon
// dersom nettsiden er i vedlikeholdsmodus. Utviklere kan passere overlayet
// ved å legge til ?dev=1 i adressefeltet eller ved å skrive inn utviklerkode.

/*
 * Vedlikeholdsskript for Sørgulen Industriservice.
 *
 * Dette skriptet viser et helsides overlegg som informerer besøkende om at
 * nettsiden er under utvikling. Utviklere kan fjerne overlegget midlertidig
 * ved å klikke på "Utvikler – vis nettsiden" og angi riktig kode. Vi har
 * fjernet avhengigheten til localStorage og query‑parametere slik at
 * overlegget alltid vises for nye besøk. Når utviklerkoden er oppgitt
 * korrekt, fjernes overlegget for den gjeldende økten.
 */
/**
 * Velkomstoverlay for Sørgulen Industriservice.
 *
 * Nettsiden er nå åpen for alle, men vi ønsker å vise et kort velkomstbanner
 * første gang en besøkende kommer inn. Banneren bruker samme styling som
 * det tidligere vedlikeholdsoverlayet, men med en ny tekst og en grønn
 * "Fortsett"-knapp. Når besøkende klikker "Fortsett" fjernes overlayet og
 * lagres i localStorage slik at det ikke vises på nytt på interne sider eller ved nye faner på samme enhet.
 */
(function () {
  // Hvis velkomstbanneren allerede er vist tidligere på denne enheten, hopp over overlay
  if (localStorage.getItem('sorgulen_welcome_shown') === '1') return;

  /**
   * Bygg HTML for velkomstoverlayet.
   * Teksten er tilpasset åpningen av nettsiden og knappen lukker overlayet.
   */
  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'maint-overlay';
    overlay.innerHTML = `
      <div id="maint-card">
        <h1>Velkommen til Sørgulen Industriservice</h1>
        <p>
          Nettsiden er nå klar til bruk. Vi gleder oss til å hjelpe Florø‑folket
          med små og store oppdrag.
        </p>
        <div id="maint-actions">
          <button id="welcomeContinue" class="cta">Fortsett</button>
        </div>
      </div>
    `;
    return overlay;
  }

  // Når DOM er klar, legg til overlegg
  document.addEventListener('DOMContentLoaded', () => {
    const overlay = buildOverlay();
    document.body.appendChild(overlay);
  });

  // Når "Fortsett"-knappen klikkes, fjern overlegg og sett flagg
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'welcomeContinue') {
      const overlay = document.getElementById('maint-overlay');
      if (overlay) overlay.remove();
      // Husk at velkomstoverlegget er vist på denne enheten
      localStorage.setItem('sorgulen_welcome_shown', '1');
    }
  });
})();