'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabungan-'));
process.env.DATA_FILE = path.join(tmpDir, 'db.json');
const { server } = require('../server');

let base;
before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
  base = `http://127.0.0.1:${server.address().port}`;
  resolve();
})));
after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function req(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

test('ringkasan bulanan menghitung pemasukan, pengeluaran, dan tabungan', async () => {
  await req('POST', '/api/transactions', { type: 'pemasukan', amount: 5000000, category: 'Gaji', date: '2026-09-01' });
  await req('POST', '/api/transactions', { type: 'pengeluaran', amount: 1500000, category: 'Tagihan', date: '2026-09-05' });
  await req('POST', '/api/transactions', { type: 'pengeluaran', amount: 500000, category: 'Makan & Minum', date: '2026-09-06' });
  await req('POST', '/api/transactions', { type: 'tabungan', amount: 1000000, category: 'Dana Darurat', date: '2026-09-02' });
  await req('POST', '/api/transactions', { type: 'tabungan', amount: 700000, category: 'Dana Darurat', date: '2026-08-02' });
  await req('POST', '/api/transactions', { type: 'tarik', amount: 200000, category: 'Dana Darurat', date: '2026-09-20' });

  const { status, data } = await req('GET', '/api/summary?month=2026-09');
  assert.strictEqual(status, 200);
  assert.strictEqual(data.income, 5000000);
  assert.strictEqual(data.expense, 2000000);
  assert.strictEqual(data.saved, 800000);
  assert.strictEqual(data.remaining, 5000000 - 2000000 - 1000000 + 200000);
  assert.strictEqual(data.savingsBalance, 700000 + 1000000 - 200000);
  assert.deepStrictEqual(data.categories.map((c) => c.name), ['Tagihan', 'Makan & Minum']);

  const aug = await req('GET', '/api/summary?month=2026-08');
  assert.strictEqual(aug.data.savingsBalance, 700000);
});

test('transaksi bisa diubah dan dihapus', async () => {
  const { data: tx } = await req('POST', '/api/transactions', { type: 'pengeluaran', amount: 10000, category: 'Transportasi', date: '2026-10-01' });
  const upd = await req('PUT', `/api/transactions/${tx.id}`, { type: 'pengeluaran', amount: 25000, category: 'Transportasi', date: '2026-10-01', note: 'ojek' });
  assert.strictEqual(upd.data.amount, 25000);
  assert.strictEqual(upd.data.note, 'ojek');
  assert.strictEqual((await req('DELETE', `/api/transactions/${tx.id}`)).status, 204);
  assert.strictEqual((await req('GET', '/api/transactions?month=2026-10')).data.length, 0);
  assert.strictEqual((await req('DELETE', `/api/transactions/${tx.id}`)).status, 404);
});

test('validasi input', async () => {
  assert.strictEqual((await req('POST', '/api/transactions', { type: 'x', amount: 1, category: 'a', date: '2026-01-01' })).status, 400);
  assert.strictEqual((await req('POST', '/api/transactions', { type: 'pengeluaran', amount: -5, category: 'a', date: '2026-01-01' })).status, 400);
  assert.strictEqual((await req('POST', '/api/transactions', { type: 'pengeluaran', amount: 5, category: '', date: '2026-01-01' })).status, 400);
  assert.strictEqual((await req('GET', '/api/summary?month=2026-13')).status, 400);
});

test('anggaran dan target tabungan', async () => {
  const b = await req('PUT', '/api/budgets?month=2026-09', { category: 'Makan & Minum', amount: 400000 });
  assert.deepStrictEqual(b.data, { 'Makan & Minum': 400000 });
  const s = await req('GET', '/api/summary?month=2026-09');
  assert.deepStrictEqual(s.data.categories.find((c) => c.name === 'Makan & Minum'), { name: 'Makan & Minum', spent: 500000, budget: 400000 });

  const { data: goal } = await req('POST', '/api/goals', { name: 'Liburan', target: 3000000 });
  const upd = await req('PUT', `/api/goals/${goal.id}`, { ...goal, saved: 500000 });
  assert.strictEqual(upd.data.saved, 500000);
  assert.strictEqual((await req('GET', '/api/goals')).data.length, 1);
});

test('data tersimpan ke file', () => {
  const saved = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
  assert.ok(saved.transactions.length >= 6);
});
