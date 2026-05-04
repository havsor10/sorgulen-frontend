// mailer.js
//
// Modul som håndterer utsendelse av e‑poster via Nodemailer. Den leser
// konfigurasjon fra miljøvariabler slik at SMTP‑innstillinger kan settes
// uten å endre kildekoden. Dersom Nodemailer ikke er installert eller
// konfigurasjonen er ufullstendig, logges e‑postene til konsollen i stedet
// for å sendes.

const nodemailer = (() => {
  try {
    return require('nodemailer');
  } catch (err) {
    return null;
  }
})();

// Opprett transport basert på miljøvariabler. Hvis Nodemailer ikke er
// tilgjengelig eller essensielle variabler mangler returnerer vi null for
// å signalere at vi skal logge e‑post i stedet for å sende.
function createTransport() {
  if (!nodemailer) return null;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

const transporter = createTransport();

/**
 * Send a raw e‑post. Faller tilbake til konsollutskrift dersom
 * Nodemailer/SMTP ikke er tilgjengelig.
 * @param {Object} options Mail options accepted by nodemailer
 */
async function sendMail(options) {
  // Legg til standard `from` hvis ikke satt
  if (!options.from) {
    options.from = process.env.SMTP_FROM || process.env.SMTP_USER;
  }
  if (transporter) {
    return transporter.sendMail(options);
  }
  // Stub: logg e‑posten til konsollen i stedet for å sende den
  console.log('[mailer] (stub) send e‑post:');
  console.log(options);
  return Promise.resolve({ response: 'Email logged (no SMTP transport)' });
}

/**
 * Generer HTML‑innhold for en ordre.
 * @param {Object} order Ordreobjekt fra klienten
 */
function orderHtml(order) {
  const dt = new Date(order.dato || order.preferredDate || Date.now()).toLocaleString('no-NO');
  const rows = [];
  rows.push(`<li>Tjeneste: ${order.tjeneste || order.service || '-'}</li>`);
  if (order.description || order.beskrivelse) {
    rows.push(`<li>Beskrivelse: ${order.description || order.beskrivelse}</li>`);
  }
  rows.push(`<li>Navn: ${order.navn || order.customer?.name || '-'}</li>`);
  rows.push(`<li>Telefon: ${order.telefon || order.customer?.phone || '-'}</li>`);
  rows.push(`<li>E‑post: ${order.epost || order.customer?.email || '-'}</li>`);
  if (order.adresse) rows.push(`<li>Adresse: ${order.adresse}</li>`);
  if (order.areal) rows.push(`<li>Areal: ${order.areal} m²</li>`);
  if (order.frekvens) rows.push(`<li>Type oppdrag: ${order.frekvens}</li>`);
  if (order.dato) rows.push(`<li>Ønsket dato: ${order.dato}</li>`);
  if (order.tid) rows.push(`<li>Ønsket klokkeslett: ${order.tid}</li>`);
  if (order.tilleggsinfo) rows.push(`<li>Tilleggsinfo: ${order.tilleggsinfo}</li>`);
  return `
    <div style="font-family:system-ui,Helvetica,Arial,sans-serif;max-width:600px">
      <h2>${process.env.COMPANY_NAME || 'Sørgulen Industriservice'} – ordrebekreftelse</h2>
      <p>Takk for bestillingen. Referanse: <strong>${order.id || '-'}</strong>.</p>
      <p>Dato: ${dt}</p>
      <h3>Bestillingsdetaljer</h3>
      <ul>
        ${rows.join('\n')}
      </ul>
      <p>Vi tar kontakt for å bekrefte tid og pris.</p>
    </div>`;
}

/**
 * Generer tekstinnhold for en ordre.
 * @param {Object} order Ordreobjekt
 */
function orderText(order) {
  const lines = [];
  lines.push(`${process.env.COMPANY_NAME || 'Sørgulen Industriservice'} – ordrebekreftelse`);
  lines.push(`Referanse: ${order.id || '-'}`);
  lines.push(`Dato: ${new Date(order.dato || order.preferredDate || Date.now()).toLocaleString('no-NO')}`);
  lines.push(`Tjeneste: ${order.tjeneste || order.service || '-'}`);
  if (order.description || order.beskrivelse) {
    lines.push(`Beskrivelse: ${order.description || order.beskrivelse}`);
  }
  lines.push(`Navn: ${order.navn || order.customer?.name || '-'}`);
  lines.push(`Telefon: ${order.telefon || order.customer?.phone || '-'}`);
  lines.push(`E‑post: ${order.epost || order.customer?.email || '-'}`);
  if (order.adresse) lines.push(`Adresse: ${order.adresse}`);
  if (order.areal) lines.push(`Areal: ${order.areal} m²`);
  if (order.frekvens) lines.push(`Type oppdrag: ${order.frekvens}`);
  if (order.dato) lines.push(`Ønsket dato: ${order.dato}`);
  if (order.tid) lines.push(`Ønsket klokkeslett: ${order.tid}`);
  if (order.tilleggsinfo) lines.push(`Tilleggsinfo: ${order.tilleggsinfo}`);
  lines.push('Vi tar kontakt for bekreftet tid og pris.');
  return lines.filter(Boolean).join('\n');
}

/**
 * Send ordrebekreftelse til kunden.
 * @param {Object} order Ordreobjekt
 */
async function sendOrderConfirmation(order) {
  if (!order || !order.epost) return;
  const subject = `Ordrebekreftelse – ref ${order.id || ''}`;
  return sendMail({
    to: order.epost,
    subject,
    html: orderHtml(order),
    text: orderText(order)
  });
}

/**
 * Send intern varsel om ny bestilling til virksomhetens e‑post.
 * @param {Object} order Ordreobjekt
 */
async function notifyInternalNewOrder(order) {
  const to = 'post@sorgulen.no';
  const subject = `Ny bestilling – ref ${order.id || ''}`;
  const html = `<p>Ny bestilling mottatt.</p>${orderHtml(order)}`;
  const text = `Ny bestilling.\n\n${orderText(order)}`;
  return sendMail({ to, subject, html, text });
}

/**
 * Send statusoppdatering til kunden når status endres av administrasjon.
 * @param {Object} order Ordreobjekt med oppdatert status
 */
async function sendStatusUpdate(order) {
  if (!order || !order.epost || !order.status) return;
  const subject = `Oppdatert status – ref ${order.id || ''}`;
  // Bygg et enkelt html‑brev. Inkluder status og ev. kommentar.
  const html = `
    <div style="font-family:system-ui,Helvetica,Arial,sans-serif;max-width:600px">
      <p>Status for din bestilling <strong>${order.id}</strong> er oppdatert til <strong>${order.status}</strong>.</p>
      ${order.kommentar ? `<p>Merknad: ${order.kommentar}</p>` : ''}
      <p>Spørsmål? Svar på denne e‑posten.</p>
    </div>`;
  const text = `Status oppdatert for ${order.id}\n\nStatus: ${order.status}\n${order.kommentar ? 'Merknad: ' + order.kommentar : ''}`;
  return sendMail({ to: order.epost, subject, html, text });
}

module.exports = {
  sendOrderConfirmation,
  notifyInternalNewOrder,
  sendStatusUpdate
};