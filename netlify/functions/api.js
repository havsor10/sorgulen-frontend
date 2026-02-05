/**
 * Netlify Functions proxy for /api/*
 *
 * Formål:
 * - Frontend (Netlify) kaller /api/... på samme domene.
 * - Netlify Function videresender server-side til Render-backend.
 *
 * Konfig:
 * - Sett env var BACKEND_BASE_URL i Netlify (anbefalt).
 *   Eksempel: https://sorgulen-backend-2.onrender.com
 */

const DEFAULT_UPSTREAM = 'https://sorgulen-backend-2.onrender.com';
const UPSTREAM = (process.env.BACKEND_BASE_URL || DEFAULT_UPSTREAM).replace(/\/+$/, '');

function buildUpstreamPath(event) {
  // Ved redirect /api/* -> /.netlify/functions/api/* blir event.path f.eks:
  // /.netlify/functions/api/services
  const prefix = '/.netlify/functions/api';
  const suffix = event.path && event.path.startsWith(prefix) ? event.path.slice(prefix.length) : '';
  // suffix er enten '' eller '/services' osv.
  return `/api${suffix}`;
}

function buildQueryString(event) {
  const qs = event.rawQueryString;
  return qs ? `?${qs}` : '';
}

function filterHeaders(headers) {
  // Ikke forward hop-by-hop headers
  const blocked = new Set([
    'host',
    'connection',
    'content-length',
    'accept-encoding',
    'x-forwarded-for',
    'x-forwarded-proto',
    'x-nf-request-id'
  ]);
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const key = String(k).toLowerCase();
    if (blocked.has(key)) continue;
    out[k] = v;
  }
  // Sikre JSON som default hvis ikke satt
  if (!Object.keys(out).some((k) => String(k).toLowerCase() === 'accept')) {
    out['Accept'] = 'application/json';
  }
  return out;
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod || 'GET';

    // OPTIONS håndteres lokalt (preflight). Browser treffer normalt ikke dette når vi bruker same-origin,
    // men det er greit å støtte.
    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key, X-Requested-With',
        },
        body: '',
      };
    }

    const upstreamPath = buildUpstreamPath(event);
    const url = `${UPSTREAM}${upstreamPath}${buildQueryString(event)}`;

    const headers = filterHeaders(event.headers);

    const fetchOpts = {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : event.body,
    };

    const res = await fetch(url, fetchOpts);

    // Returner body som tekst uansett; frontend avgjør om den vil parse JSON.
    const text = await res.text();

    // Kopier utvalgte headers (ikke alle, for å unngå uønskede effekter)
    const resHeaders = {
      'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      // Ikke strengt nødvendig i same-origin, men gjør debugging enklere.
      'Access-Control-Allow-Origin': '*',
    };

    return {
      statusCode: res.status,
      headers: resHeaders,
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Proxy-feil mot backend', detail: String(err && err.message ? err.message : err) }),
    };
  }
};
