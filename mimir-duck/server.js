'use strict';

/**
 * mimir-duck — DuckDB SQL execution sidecar.
 *
 * Exposes three endpoints that the Mimir backend calls:
 *   GET  /health   → { status: 'ok' }
 *   POST /execute  → runs SQL, writes result CSV to S3, returns {}
 *   POST /query    → runs SQL, returns { status, rows: [{col: val, ...}] }
 *
 * Each request receives a JSON body with:
 *   sql, setup_sql, s3_endpoint, s3_region, s3_access_key, s3_secret_key,
 *   s3_url_style, output_s3_path (execute only)
 */

const http = require('node:http');
const duckdb = require('duckdb');

// ---- helpers ----

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  // DuckDB returns 64-bit integers as BigInt; convert to Number for JSON serialisation.
  const json = JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? Number(v) : v));
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function exec(conn, sql) {
  if (!sql || !sql.trim()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    conn.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function queryAll(conn, sql) {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => (err ? reject(err) : resolve(rows ?? [])));
  });
}

function configureS3(conn, body) {
  const endpoint = (body.s3_endpoint || '').replace(/^https?:\/\//, '');
  const region    = body.s3_region       || 'us-east-1';
  const key       = body.s3_access_key   || 'test';
  const secret    = body.s3_secret_key   || 'test';
  const style     = body.s3_url_style    || 'path';

  return exec(conn, `
    INSTALL httpfs;
    LOAD httpfs;
    SET s3_endpoint='${endpoint}';
    SET s3_region='${region}';
    SET s3_access_key_id='${key}';
    SET s3_secret_access_key='${secret}';
    SET s3_use_ssl=false;
    SET s3_url_style='${style}';
  `);
}

// ---- request handler ----

async function handle(req, res) {
  if (req.url === '/health') {
    send(res, 200, { status: 'ok' });
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    send(res, 400, { error: e.message });
    return;
  }

  const db = new duckdb.Database(':memory:');
  const conn = db.connect();

  try {
    await configureS3(conn, body);

    if (body.setup_sql) {
      try {
        await exec(conn, body.setup_sql);
      } catch (e) {
        // Log but do not abort — individual view failures should not block the query
        console.warn('[duck] setup_sql warning:', e.message);
      }
    }

    if (req.url === '/execute') {
      const out = body.output_s3_path;
      if (!out) throw new Error('output_s3_path is required');
      await exec(conn, `COPY (${body.sql}) TO '${out}' (FORMAT CSV, HEADER true, DELIMITER ',')`);
      send(res, 200, { status: 'success' });

    } else if (req.url === '/query') {
      const rows = await queryAll(conn, body.sql);
      send(res, 200, { status: 'success', rows });

    } else {
      send(res, 404, { error: 'Not found' });
    }

  } catch (e) {
    console.error('[duck] error:', e.message);
    send(res, 500, { error: e.message });
  } finally {
    db.close();
  }
}

// ---- server ----

const PORT = Number(process.env.DUCK_PORT || 3000);
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[duck] unhandled:', e);
    if (!res.headersSent) send(res, 500, { error: 'Internal server error' });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[duck] DuckDB HTTP server listening on :${PORT}`);
});
