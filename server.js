'use strict';

// Server lokal untuk Aplikasi Tabungan & Pengeluaran Bulanan.
// Tanpa dependensi eksternal: hanya modul bawaan Node.js.
// Data disimpan di file JSON (default: ./data/db.json).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const TYPES = ['pemasukan', 'pengeluaran', 'tabungan', 'tarik'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- Penyimpanan ----------

function emptyDb() {
  return { transactions: [], goals: [], budgets: {} };
}

function loadDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const db = JSON.parse(raw);
    return {
      transactions: Array.isArray(db.transactions) ? db.transactions : [],
      goals: Array.isArray(db.goals) ? db.goals : [],
      budgets: db.budgets && typeof db.budgets === 'object' ? db.budgets : {},
    };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Gagal membaca data, memulai dengan data kosong:', err.message);
    return emptyDb();
  }
}

let db = loadDb();

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Validasi ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, 'Nominal harus berupa angka lebih dari 0');
  return Math.round(n);
}

function validateTransaction(body) {
  if (!TYPES.includes(body.type)) throw new HttpError(400, 'Jenis transaksi tidak valid');
  if (typeof body.date !== 'string' || !DATE_RE.test(body.date)) throw new HttpError(400, 'Tanggal tidak valid (format YYYY-MM-DD)');
  const category = String(body.category || '').trim().slice(0, 50);
  if (!category) throw new HttpError(400, 'Kategori wajib diisi');
  return {
    type: body.type,
    date: body.date,
    amount: parseAmount(body.amount),
    category,
    note: String(body.note || '').trim().slice(0, 200),
  };
}

function validateGoal(body) {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) throw new HttpError(400, 'Nama target wajib diisi');
  const saved = body.saved === undefined || body.saved === '' ? 0 : Number(body.saved);
  if (!Number.isFinite(saved) || saved < 0) throw new HttpError(400, 'Dana terkumpul tidak valid');
  let deadline = '';
  if (body.deadline) {
    if (!DATE_RE.test(body.deadline)) throw new HttpError(400, 'Tenggat tidak valid');
    deadline = body.deadline;
  }
  return { name, target: parseAmount(body.target), saved: Math.round(saved), deadline };
}

// ---------- Ringkasan ----------

function summarize(month) {
  const inMonth = db.transactions.filter((t) => t.date.startsWith(month));
  const totals = { pemasukan: 0, pengeluaran: 0, tabungan: 0, tarik: 0 };
  const byCategory = {};
  for (const t of inMonth) {
    totals[t.type] += t.amount;
    if (t.type === 'pengeluaran') byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  }
  // Saldo tabungan kumulatif sampai akhir bulan yang dipilih.
  let savingsBalance = 0;
  for (const t of db.transactions) {
    if (t.date.slice(0, 7) > month) continue;
    if (t.type === 'tabungan') savingsBalance += t.amount;
    if (t.type === 'tarik') savingsBalance -= t.amount;
  }
  const budgets = db.budgets[month] || {};
  const categories = Object.keys({ ...byCategory, ...budgets })
    .map((name) => ({ name, spent: byCategory[name] || 0, budget: budgets[name] || 0 }))
    .sort((a, b) => b.spent - a.spent);

  return {
    month,
    income: totals.pemasukan,
    expense: totals.pengeluaran,
    saved: totals.tabungan - totals.tarik,
    // Uang yang masih bisa dipakai: pemasukan - pengeluaran - setoran tabungan + penarikan tabungan.
    remaining: totals.pemasukan - totals.pengeluaran - totals.tabungan + totals.tarik,
    savingsBalance,
    categories,
    count: inMonth.length,
  };
}

function toCsv(month) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Tanggal', 'Jenis', 'Kategori', 'Nominal', 'Catatan']];
  db.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => rows.push([t.date, t.type, t.category, t.amount, t.note]));
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

// ---------- HTTP ----------

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new HttpError(413, 'Data terlalu besar'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') throw new Error();
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'Body JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function requireMonth(url) {
  const month = url.searchParams.get('month');
  if (!month || !MONTH_RE.test(month)) throw new HttpError(400, 'Parameter month wajib (format YYYY-MM)');
  return month;
}

function findIndex(list, id) {
  const idx = list.findIndex((item) => item.id === id);
  if (idx === -1) throw new HttpError(404, 'Data tidak ditemukan');
  return idx;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', resource, id?]
  const [, resource, id] = parts;
  const method = req.method;

  if (resource === 'transactions') {
    if (!id && method === 'GET') {
      const month = requireMonth(url);
      const list = db.transactions
        .filter((t) => t.date.startsWith(month))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      return send(res, 200, list);
    }
    if (!id && method === 'POST') {
      const tx = { id: crypto.randomUUID(), ...validateTransaction(await readBody(req)), createdAt: new Date().toISOString() };
      db.transactions.push(tx);
      saveDb();
      return send(res, 201, tx);
    }
    if (id && method === 'PUT') {
      const idx = findIndex(db.transactions, id);
      db.transactions[idx] = { ...db.transactions[idx], ...validateTransaction(await readBody(req)) };
      saveDb();
      return send(res, 200, db.transactions[idx]);
    }
    if (id && method === 'DELETE') {
      db.transactions.splice(findIndex(db.transactions, id), 1);
      saveDb();
      return send(res, 204, '');
    }
  }

  if (resource === 'summary' && method === 'GET') {
    return send(res, 200, summarize(requireMonth(url)));
  }

  if (resource === 'export' && method === 'GET') {
    const month = requireMonth(url);
    return send(res, 200, toCsv(month), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transaksi-${month}.csv"`,
    });
  }

  if (resource === 'budgets') {
    if (method === 'GET') return send(res, 200, db.budgets[requireMonth(url)] || {});
    if (method === 'PUT') {
      const month = requireMonth(url);
      const body = await readBody(req);
      const category = String(body.category || '').trim().slice(0, 50);
      if (!category) throw new HttpError(400, 'Kategori wajib diisi');
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, 'Anggaran tidak valid');
      db.budgets[month] = db.budgets[month] || {};
      if (amount === 0) delete db.budgets[month][category];
      else db.budgets[month][category] = Math.round(amount);
      saveDb();
      return send(res, 200, db.budgets[month]);
    }
  }

  if (resource === 'goals') {
    if (!id && method === 'GET') return send(res, 200, db.goals);
    if (!id && method === 'POST') {
      const goal = { id: crypto.randomUUID(), ...validateGoal(await readBody(req)), createdAt: new Date().toISOString() };
      db.goals.push(goal);
      saveDb();
      return send(res, 201, goal);
    }
    if (id && method === 'PUT') {
      const idx = findIndex(db.goals, id);
      db.goals[idx] = { ...db.goals[idx], ...validateGoal(await readBody(req)) };
      saveDb();
      return send(res, 200, db.goals[idx]);
    }
    if (id && method === 'DELETE') {
      db.goals.splice(findIndex(db.goals, id), 1);
      saveDb();
      return send(res, 204, '');
    }
  }

  throw new HttpError(404, 'Endpoint tidak ditemukan');
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, { error: 'URL tidak valid' });
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Akses ditolak' });

  fs.readFile(filePath, (err, content) => {
    if (err) return send(res, 404, 'Tidak ditemukan', { 'Content-Type': 'text/plain; charset=utf-8' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'Terjadi kesalahan pada server' : err.message });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Metode tidak diizinkan' });
  serveStatic(req, res, url);
}

const server = http.createServer(handleRequest);

// ---------- Menjalankan server ----------

function listen(srv, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => { srv.off('listening', onListening); reject(err); };
    const onListening = () => { srv.off('error', onError); resolve(); };
    srv.once('error', onError);
    srv.once('listening', onListening);
    srv.listen(port, host);
  });
}

function closeServer(srv) {
  return new Promise((resolve) => srv.close(() => resolve()));
}

// Browser bisa mengartikan "localhost" sebagai 127.0.0.1 (IPv4) atau ::1 (IPv6),
// jadi secara default server mendengarkan di keduanya. Jika port sedang dipakai
// aplikasi lain, otomatis mencoba port berikutnya.
async function start() {
  const hosts = process.env.HOST ? [process.env.HOST] : ['127.0.0.1', '::1'];
  const fixedPort = Boolean(process.env.PORT);
  for (let port = PORT; port < PORT + 20; port++) {
    const servers = [];
    try {
      for (const [i, host] of hosts.entries()) {
        const srv = i === 0 ? server : http.createServer(handleRequest);
        try {
          await listen(srv, port, host);
          servers.push(srv);
        } catch (err) {
          // IPv6 tidak tersedia di komputer ini: cukup pakai IPv4.
          if (i > 0 && ['EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EINVAL'].includes(err.code)) continue;
          throw err;
        }
      }
      return port;
    } catch (err) {
      await Promise.all(servers.map(closeServer));
      if (err.code === 'EADDRINUSE' && !fixedPort) {
        console.log(`Port ${port} sedang dipakai aplikasi lain, mencoba port ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Tidak ada port kosong antara ${PORT} dan ${PORT + 19}`);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {}); // Jika gagal, pengguna tetap bisa membuka URL secara manual.
}

if (require.main === module) {
  start().then((port) => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  Aplikasi Tabungan sudah berjalan!');
    console.log(`  Buka di browser: ${url}`);
    console.log(`  Data disimpan di: ${DATA_FILE}`);
    console.log('');
    console.log('  Jangan tutup jendela ini selama aplikasi dipakai. Tekan Ctrl+C untuk berhenti.');
    console.log('');
    if (process.argv.includes('--open')) openBrowser(url);
  }).catch((err) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} sedang dipakai. Coba port lain, mis. PORT=8080.`);
    else if (err.code === 'EACCES') console.error(`Tidak punya izin memakai port ${PORT}. Coba port di atas 1024.`);
    else console.error('Gagal menjalankan server:', err.message);
    process.exit(1);
  });
}

module.exports = { server };
