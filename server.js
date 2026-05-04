// Simple HTTP server for Sorgulen Industriservice
// This server is intentionally self‑contained so that no external packages are 
// required.
// It handles two things:
//   1) Serving static files from the project directory (HTML, CSS, JS, images, 
// etc.).
//   2) Exposing a small API at /bestillinger for listing and creating orders.
// Orders are persisted to a JSON file under admin/data/bestillinger.json.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Crypto is used to generate a default admin token when none is provided.
const crypto = require('crypto');

// Load environment variables from .env if available. Attempt to use dotenv
// if installed; otherwise fall back to a simple parser. This ensures that
// sensitive credentials like GMAIL_USER, GMAIL_PASS, ADMIN_USER, etc. are
// loaded even in minimal environments without dependencies.
try {
  // Attempt to load .env using dotenv if the package is available
  require('dotenv').config();
} catch (err) {
  // If dotenv is not installed, manually parse the .env file
  try {
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    });
  } catch (e) {
    // If .env file cannot be read, continue without loading environment variables
  }
}

// Try to load nodemailer. If not available, fall back to a stubbed
// transporter that logs emails to the console rather than sending them.
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}
const transporter = nodemailer
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    })
  : {
      sendMail: (options, cb) => {
        console.log('nodemailer stub: would send email', options);
        cb && cb(null, { response: 'Email skipped (nodemailer not available)' });
      }
    };

// ---------------------------------------------------------------------------
// Live status SSE handling
//
// A simple server‑sent events (SSE) implementation to broadcast the current
// brøyting status to all connected clients. The takstameter posts updates
// via POST /broyting-status with the address and an action ("start" or "stop").
// Subscribers connect via GET /live and receive JSON objects like:
//   { "active": true, "street": "Kleiva" }
// or { "active": false } when no brøyting is active.
const liveClients = [];
let currentLiveStatus = { active: false };

/**
 * Handle live status endpoints.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 * @returns {boolean} True if the request was handled
 */
function handleLive(req, res, pathname) {
  // SSE endpoint: clients subscribe here to receive updates
  if (pathname === '/live') {
    // Configure headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    // Immediately send the current state to the new client
    res.write(`data: ${JSON.stringify(currentLiveStatus)}\n\n`);
    // Track client
    const client = res;
    liveClients.push(client);
    // Remove when connection closes
    req.on('close', () => {
      const idx = liveClients.indexOf(client);
      if (idx !== -1) liveClients.splice(idx, 1);
    });
    return true;
  }
  // Update endpoint: takstameter posts here to broadcast status
  if (pathname === '/broyting-status') {
    // Allow CORS for cross‑origin POST requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const action = String(data.action || '').toLowerCase();
          const addr = String(data.address || '').trim();
          // Remove numeric parts from the address to get the street name
          let street = '';
          if (addr) {
            street = addr.replace(/\d.*$/, '').trim();
          }
          if (action === 'start') {
            currentLiveStatus = { active: true, street: street };
          } else {
            currentLiveStatus = { active: false };
          }
          // Broadcast updated status to all connected clients
          const payload = JSON.stringify(currentLiveStatus);
          liveClients.forEach(c => {
            c.write(`data: ${payload}\n\n`);
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad Request' }));
        }
      });
      return true;
    }
    // Unsupported method
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return true;
  }
  return false;
}

// Load our custom mailer module for sending order confirmations, internal
// notifications and status updates. This module will attempt to use SMTP
// settings defined via environment variables (SMTP_HOST, SMTP_PORT, etc.).
// If these are not configured or nodemailer is missing, it will log emails
// instead of sending them. See mailer.js for details.
let mailer;
try {
  mailer = require('./mailer.js');
} catch (err) {
  // Fall back to no-op implementations if mailer cannot be loaded. This
  // ensures that the server still runs even if the file is missing.
  mailer = {
    sendOrderConfirmation: async () => {},
    notifyInternalNewOrder: async () => {},
    sendStatusUpdate: async () => {}
  };
}

// -----------------------------------------------------------------------------
// Administrator credentials and session token
//
// These values are read from environment variables so they can be configured
// without changing the source code. If no values are provided, sensible
// defaults are applied. The ADMIN_TOKEN is used to sign the administrator
// session cookie. You should replace the defaults in your .env file with
// strong, unique secrets.
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(16).toString('hex');

/**
 * Parse cookies from the request headers into an object.
 * @param {http.IncomingMessage} req
 * @returns {Object}
 */
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach(c => {
    const parts = c.trim().split('=');
    const key = parts.shift();
    if (!key) return;
    cookies[key] = decodeURIComponent(parts.join('='));
  });
  return cookies;
}

/**
 * Determine if the current request has a valid administrator session.
 * @param {http.IncomingMessage} req
 */
function isAdminAuthenticated(req) {
  const cookies = parseCookies(req);
  return cookies.admin && cookies.admin === ADMIN_TOKEN;
}

/**
 * Handle authentication endpoints. Supports POST /auth/login to establish an
 * admin session cookie and /auth/logout to clear the session. Returns true
 * if the request was handled.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 */
function handleAuth(req, res, pathname) {
  if (pathname === '/auth/login') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return true;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        if (String(username) === String(ADMIN_USER) && String(password) === String(ADMIN_PASS)) {
          // Create cookie string; SameSite=Strict to avoid CSRF. Path=/ to allow for all admin paths.
          const cookieVal = encodeURIComponent(ADMIN_TOKEN);
          const cookieString = `admin=${cookieVal}; HttpOnly; SameSite=Strict; Path=/`;
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieString
          });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request' }));
      }
    });
    return true;
  }
  if (pathname === '/auth/logout') {
    // Clear the admin cookie immediately
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'admin=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict'
    });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }
  return false;
}

/**
 * Protect the admin area. If a request targets the /admin path and the user
 * is not authenticated, respond with 404 so that the admin interface remains
 * hidden. If authenticated, set a noindex header on the response. Returns
 * true if a 404 response was sent, false otherwise.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 */
function handleAdminProtection(req, res, pathname) {
  // All admin paths require authentication except for the login page itself.  We
  // explicitly allow the login page so that unauthenticated users can access
  // it to submit their credentials. Any other request under `/admin` without a
  // valid cookie will return 404 to obscure the existence of the admin panel.
  if (pathname.startsWith('/admin')) {
    // Allow the login page for unauthenticated users
    if (pathname === '/admin/login.html') {
      return false;
    }
    // Reject all other admin paths unless authenticated
    if (!isAdminAuthenticated(req)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return true;
    }
    // Authenticated: instruct search engines not to index admin pages
    res.setHeader('X-Robots-Tag', 'noindex');
  }
  return false;
}

/**
 * Enkel e‑postfunksjon. Denne er bare en stub som logger meldingen til 
 * konsollen.
 * I et produksjonsmiljø bør du integrere mot en e‑postleverandør som SendGrid,
 * Mailgun eller en SMTP‑server.
 *
 * @param {string} to Mottakerens e‑postadresse
 * @param {string} subject Emnefelt
 * @param {string} message E‑postinnhold (tekst)
 */
function sendEmail(to, subject, message) {
  if (!to) return;
  console.log('Send e‑post til:', to);
  console.log('Emne:', subject);
  console.log('Melding:', message);
  // Her kunne du bruke nodemailer eller en annen tjeneste for å sende e‑post.
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: to,
    subject: subject,
    text: message
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Feil ved sending av e‑post:', error);
    } else {
      console.log('E‑post sendt:', info.response);
    }
  });
}

// Path to the JSON file where orders are stored.
const dataPath = path.join(__dirname, 'admin', 'data', 'bestillinger.json');

/**
 * Ensure the orders file exists. If it does not, create it with an empty array.
 */
function ensureOrdersFile() {
  try {
    fs.accessSync(dataPath, fs.constants.F_OK);
  } catch (e) {
    // File does not exist, create an empty list
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, '[]', 'utf8');
  }
}

/**
 * Read orders from the JSON file. Returns an array of order objects.
 */
function readOrders() {
  ensureOrdersFile();
  const json = fs.readFileSync(dataPath, 'utf8');
  try {
    return JSON.parse(json);
  } catch (e) {
    return [];
  }
}

/**
 * Save orders to the JSON file. Accepts an array of order objects.
 */
function saveOrders(orders) {
  fs.writeFileSync(dataPath, JSON.stringify(orders, null, 2), 'utf8');
}

/**
 * Determine the appropriate Content-Type header based on file extension.
 * @param {string} filePath
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

/**
 * Serve a static file from the project directory. If the file does not exist,
 * respond with a 404. This function makes sure that the requested path stays
 * within the project directory to prevent directory traversal attacks.
 *
 * @param {string} reqPath The URL path to serve
 * @param {http.ServerResponse} res
 */
function serveStatic(reqPath, res) {
  // Prevent directory traversal (../) by resolving and normalising the path
  const baseDir = __dirname;
  let safePath = path.normalize(path.join(baseDir, reqPath));
  if (!safePath.startsWith(baseDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // If directory is requested, default to index.html
  if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
    safePath = path.join(safePath, 'index.html');
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      const contentType = getContentType(safePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}

/**
 * Handle API requests related to orders (/bestillinger).
 * Supports GET to list orders and POST to create a new order.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname The URL pathname
 */
function handleApi(req, res, pathname) {
  if (pathname === '/bestillinger') {
    // CORS‑hoder for å tillate forespørsler fra hvor som helst
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }
    if (req.method === 'GET') {
      const orders = readOrders();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(orders));
    } else if (req.method === 'POST') {
      // Create a new order. Body should be a JSON object with fields like
      // navn, epost, telefon, adresse, dato, tid etc. Additional fields are
      // accepted and stored alongside the order. A unique id and default
      // status are assigned if missing. After persisting the order to disk,
      // trigger asynchronous email notifications via the mailer module.
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const order = JSON.parse(body);
          // Basic validation: require minimum fields
          if (!order || !order.navn || !order.adresse || !order.dato) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ufullstendig bestilling' }));
            return;
          }
          // Assign ID if missing. Use timestamp to avoid collisions.
          if (!order.id) order.id = Date.now();
          const orders = readOrders();
          // Default status if none provided
          if (!order.status) order.status = 'venter-godkjenning';
          orders.push(order);
          saveOrders(orders);
          // Asynchronously send emails. Do not await in order to not block
          // response; any errors are logged inside mailer implementation.
          try {
            await mailer.sendOrderConfirmation(order);
          } catch (e) {
            console.error('Failed to send order confirmation:', e);
          }
          try {
            await mailer.notifyInternalNewOrder(order);
          } catch (e) {
            console.error('Failed to notify internal new order:', e);
          }
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id: order.id }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ugyldig JSON' }));
        }
      });
    } else if (req.method === 'PUT') {
      // Update an existing order by id. Accepts JSON body with new status,
      // price, tidsbruk or kommentar. After persisting, sends a status
      // update email via the mailer.
      const parsedUrl = url.parse(req.url, true);
      const id = parsedUrl.query.id;
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Mangler id' }));
        return true;
      }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const update = JSON.parse(body);
          const orders = readOrders();
          const idx = orders.findIndex(o => String(o.id) === String(id));
          if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bestilling ikke funnet' }));
            return;
          }
          // Update fields on the order. Only update known fields if provided.
          const order = orders[idx];
          if (update.status) order.status = update.status;
          if (update.pris) order.pris = update.pris;
          if (update.tidsbruk) order.tidsbruk = update.tidsbruk;
          if (update.kommentar) order.kommentar = update.kommentar;
          saveOrders(orders);
          // Trigger status update email asynchronously
          if (order.epost && update.status) {
            try {
              await mailer.sendStatusUpdate(order);
            } catch (e) {
              console.error('Failed to send status update:', e);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ugyldig JSON' }));
        }
      });
    } else {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
    }
    return true;
  }
  return false;
}

// Create the HTTP server
const server = http.createServer((req, res) => {
  // Set common security headers on every response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // HSTS is mainly relevant for HTTPS deployments; still set max-age
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  // Authenticate login/logout endpoints
  if (handleAuth(req, res, pathname)) {
    return;
  }
  // Protect admin endpoints
  if (handleAdminProtection(req, res, pathname)) {
    return;
  }
  // First handle API endpoints
  if (handleApi(req, res, pathname)) {
    return;
  }
  // Otherwise serve static files. Remove leading slash to map to filesystem.
  let reqPath = pathname;
  if (reqPath.startsWith('/')) reqPath = reqPath.slice(1);
  // When requesting root (''), default to index.html
  if (reqPath === '') reqPath = 'index.html';
  serveStatic(reqPath, res);
});

// Start listening on a port. In production (Render) the port is provided via
// process.env.PORT. Locally fall tilbake til 3002. Bind to 0.0.0.0 so it works
// in different environments.
const PORT = process.env.PORT || 3002;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server kjører på http://0.0.0.0:${PORT}`);
});
