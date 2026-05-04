// kontakt-prefill.js
//
// Fyller inn standardtekst i kontaktskjemaet basert på URL‑parametere.
// Hvis siden åpnes med ?utleie=Navn&periode=Dag|Helg|Uke, settes emne og
// meldingsfeltet automatisk slik at brukeren kun trenger å fylle inn
// personopplysninger og eventuelle kommentarer.
(function () {
  const params = new URLSearchParams(window.location.search);
  const utleie = params.get('utleie');
  const periode = params.get('periode') || '';
  // Finn emnefelt og meldingsfelt. Disse kan ha ulike navn/IDer avhengig av
  // implementasjonen. Vi prøver flere varianter for bred kompatibilitet.
  const subjectField = document.querySelector('[name="subject"], #subject, input[name="emne"]');
  const messageField = document.querySelector('textarea, [name="message"], #message');
  if (!messageField) return;
  const header = utleie ? `Utleieforespørsel: ${decodeURIComponent(utleie)}` : 'Utleieforespørsel';
  const periodLine = periode ? `Periode: ${periode}` : 'Periode: Dag / Helg / Uke';
  const template = `${header}\n${periodLine}\nNavn:\nTelefon:\nAdresse:\nØnsket hentedato:\nKommentarer:`;
  if (!messageField.value || messageField.value.trim() === '') {
    messageField.value = template;
  }
  if (subjectField && (!subjectField.value || subjectField.value.trim() === '')) {
    subjectField.value = header;
  }
  // Scroll til skjema om det finnes
  const form = messageField.closest('form');
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    messageField.focus();
  }
})();