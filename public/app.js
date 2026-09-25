'use strict';

const TYPE_LABEL = {
  pemasukan: 'Pemasukan',
  pengeluaran: 'Pengeluaran',
  tabungan: 'Setor Tabungan',
  tarik: 'Tarik Tabungan',
};

const DEFAULT_CATEGORIES = {
  pengeluaran: ['Makan & Minum', 'Transportasi', 'Belanja', 'Tagihan', 'Kesehatan', 'Hiburan', 'Pendidikan', 'Lainnya'],
  pemasukan: ['Gaji', 'Bonus', 'Usaha', 'Hadiah', 'Lainnya'],
  tabungan: ['Tabungan Umum', 'Dana Darurat', 'Investasi'],
  tarik: ['Tabungan Umum', 'Dana Darurat', 'Investasi'],
};

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const fmt = (n) => rupiah.format(n);
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const $ = (sel) => document.querySelector(sel);

const state = {
  month: currentMonth(),
  transactions: [],
  goals: [],
  editingId: null,
};

function pad(n) { return String(n).padStart(2, '0'); }
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
// Tanggal default form: hari ini jika bulan yang dipilih adalah bulan ini, selain itu tanggal 1.
function defaultDate() {
  return state.month === currentMonth() ? today() : `${state.month}-01`;
}

// "50.000", "50000", "Rp 50.000" -> 50000
function parseRupiah(value) {
  const digits = String(value).replace(/[^\d]/g, '');
  return digits ? Number(digits) : NaN;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Permintaan gagal (${res.status})`);
  return data;
}

// ---------- Render ----------

function renderSummary(s) {
  $('#sumIncome').textContent = fmt(s.income);
  $('#sumExpense').textContent = fmt(s.expense);
  $('#sumSaved').textContent = fmt(s.saved);
  $('#sumRemaining').textContent = fmt(s.remaining);
  $('#sumRemaining').classList.toggle('negative', s.remaining < 0);
  $('#sumBalance').textContent = fmt(s.savingsBalance);
  $('#sumBalance').classList.toggle('negative', s.savingsBalance < 0);

  const chart = $('#categoryChart');
  if (!s.categories.length) {
    chart.innerHTML = '<p class="muted empty">Belum ada pengeluaran.</p>';
  } else {
    const max = Math.max(...s.categories.map((c) => Math.max(c.spent, c.budget)));
    chart.innerHTML = s.categories.map((c) => {
      const over = c.budget > 0 && c.spent > c.budget;
      const scale = c.budget > 0 ? c.budget : max;
      const pct = Math.min(100, scale ? (c.spent / scale) * 100 : 0);
      const label = c.budget > 0 ? `${fmt(c.spent)} / ${fmt(c.budget)}` : fmt(c.spent);
      const fillClass = c.budget > 0 ? (over ? 'over' : 'ok') : '';
      return `<div class="bar-row${over ? ' over' : ''}">
        <div class="bar-label"><span>${escapeHtml(c.name)}${over ? ' ⚠️' : ''}</span><span class="amt">${label}</span></div>
        <div class="bar-track"><div class="bar-fill ${fillClass}" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  $('#expenseCategoryList').innerHTML = [...new Set([...DEFAULT_CATEGORIES.pengeluaran, ...s.categories.map((c) => c.name)])]
    .map((c) => `<option value="${escapeHtml(c)}">`).join('');
}

function renderTransactions() {
  const type = $('#filterType').value;
  const q = $('#searchBox').value.trim().toLowerCase();
  const list = state.transactions.filter((t) =>
    (!type || t.type === type) &&
    (!q || t.category.toLowerCase().includes(q) || t.note.toLowerCase().includes(q)));

  $('#txCount').textContent = `(${list.length})`;
  $('#emptyState').hidden = list.length > 0;
  $('#emptyState').textContent = state.transactions.length ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi di bulan ini.';

  $('#txBody').innerHTML = list.map((t) => {
    const sign = t.type === 'pemasukan' || t.type === 'tarik' ? '+' : '−';
    return `<tr>
      <td>${dateFmt.format(new Date(t.date + 'T00:00:00'))}</td>
      <td><span class="badge ${t.type}">${TYPE_LABEL[t.type]}</span></td>
      <td>${escapeHtml(t.category)}</td>
      <td class="note">${escapeHtml(t.note)}</td>
      <td class="num amt-${t.type}">${sign}${fmt(t.amount)}</td>
      <td class="actions">
        <button class="btn small" data-edit="${t.id}">Ubah</button>
        <button class="btn small danger" data-delete="${t.id}">Hapus</button>
      </td>
    </tr>`;
  }).join('');
}

function renderGoals() {
  const el = $('#goalList');
  if (!state.goals.length) {
    el.innerHTML = '<p class="muted">Belum ada target. Tambahkan target seperti "Dana Darurat" atau "Liburan".</p>';
    return;
  }
  el.innerHTML = state.goals.map((g) => {
    const pct = Math.min(100, (g.saved / g.target) * 100);
    const done = g.saved >= g.target;
    const deadline = g.deadline ? ` · tenggat ${dateFmt.format(new Date(g.deadline + 'T00:00:00'))}` : '';
    return `<div class="goal${done ? ' done' : ''}">
      <div class="goal-head"><strong>${escapeHtml(g.name)}</strong><span>${Math.floor(pct)}%${done ? ' ✅' : ''}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <small>${fmt(g.saved)} dari ${fmt(g.target)}${deadline}</small>
      <div class="goal-actions">
        <button class="btn small" data-goal-add="${g.id}">+ Tambah dana</button>
        <button class="btn small" data-goal-sub="${g.id}">− Kurangi</button>
        <button class="btn small danger" data-goal-delete="${g.id}">Hapus</button>
      </div>
    </div>`;
  }).join('');
}

function updateCategoryOptions() {
  const type = new FormData($('#txForm')).get('type');
  const used = state.transactions.filter((t) => t.type === type).map((t) => t.category);
  $('#categoryList').innerHTML = [...new Set([...DEFAULT_CATEGORIES[type], ...used])]
    .map((c) => `<option value="${escapeHtml(c)}">`).join('');
}

// ---------- Data ----------

async function loadMonth() {
  $('#monthPicker').value = state.month;
  $('#exportLink').href = `/api/export?month=${state.month}`;
  const [transactions, summary] = await Promise.all([
    api(`/api/transactions?month=${state.month}`),
    api(`/api/summary?month=${state.month}`),
  ]);
  state.transactions = transactions;
  renderSummary(summary);
  renderTransactions();
  updateCategoryOptions();
}

async function loadGoals() {
  state.goals = await api('/api/goals');
  renderGoals();
}

function resetForm() {
  const form = $('#txForm');
  const type = new FormData(form).get('type');
  form.reset();
  form.elements.type.value = state.editingId ? 'pengeluaran' : type;
  form.elements.date.value = defaultDate();
  state.editingId = null;
  $('#formTitle').textContent = 'Tambah Transaksi';
  $('#submitBtn').textContent = 'Simpan';
  $('#cancelEdit').hidden = true;
  $('#formError').textContent = '';
  updateCategoryOptions();
}

function startEdit(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return;
  const form = $('#txForm');
  state.editingId = id;
  form.elements.type.value = t.type;
  form.elements.amount.value = t.amount.toLocaleString('id-ID');
  form.elements.category.value = t.category;
  form.elements.date.value = t.date;
  form.elements.note.value = t.note;
  $('#formTitle').textContent = 'Ubah Transaksi';
  $('#submitBtn').textContent = 'Simpan Perubahan';
  $('#cancelEdit').hidden = false;
  updateCategoryOptions();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.amount.focus();
}

// ---------- Event ----------

function formatAmountInput(e) {
  const n = parseRupiah(e.target.value);
  e.target.value = Number.isNaN(n) ? '' : n.toLocaleString('id-ID');
}

function bindEvents() {
  $('#prevMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); onMonthChange(); });
  $('#nextMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); onMonthChange(); });
  $('#monthPicker').addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.month = e.target.value;
    onMonthChange();
  });

  document.querySelectorAll('input[inputmode="numeric"]').forEach((el) => el.addEventListener('input', formatAmountInput));

  const form = $('#txForm');
  form.addEventListener('change', (e) => { if (e.target.name === 'type') updateCategoryOptions(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const body = {
      type: data.get('type'),
      amount: parseRupiah(data.get('amount')),
      category: data.get('category'),
      date: data.get('date'),
      note: data.get('note'),
    };
    try {
      if (state.editingId) await api(`/api/transactions/${state.editingId}`, { method: 'PUT', body });
      else await api('/api/transactions', { method: 'POST', body });
      const txMonth = body.date.slice(0, 7);
      resetForm();
      if (txMonth !== state.month) {
        state.month = txMonth;
        form.elements.date.value = defaultDate();
      }
      await loadMonth();
    } catch (err) {
      $('#formError').textContent = err.message;
    }
  });
  $('#cancelEdit').addEventListener('click', resetForm);

  $('#filterType').addEventListener('change', renderTransactions);
  $('#searchBox').addEventListener('input', renderTransactions);

  $('#txBody').addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const deleteId = e.target.dataset.delete;
    if (editId) startEdit(editId);
    if (deleteId && confirm('Hapus transaksi ini?')) {
      try {
        await api(`/api/transactions/${deleteId}`, { method: 'DELETE' });
        if (state.editingId === deleteId) resetForm();
        await loadMonth();
      } catch (err) { alert(err.message); }
    }
  });

  $('#budgetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/api/budgets?month=${state.month}`, {
        method: 'PUT',
        body: { category: f.elements.category.value, amount: parseRupiah(f.elements.amount.value) },
      });
      f.reset();
      await loadMonth();
    } catch (err) { alert(err.message); }
  });

  $('#goalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/api/goals', {
        method: 'POST',
        body: { name: f.elements.name.value, target: parseRupiah(f.elements.target.value), deadline: f.elements.deadline.value },
      });
      f.reset();
      await loadGoals();
    } catch (err) { alert(err.message); }
  });

  $('#goalList').addEventListener('click', async (e) => {
    const { goalAdd, goalSub, goalDelete } = e.target.dataset;
    const id = goalAdd || goalSub || goalDelete;
    if (!id) return;
    const goal = state.goals.find((g) => g.id === id);
    if (!goal) return;
    try {
      if (goalDelete) {
        if (!confirm(`Hapus target "${goal.name}"?`)) return;
        await api(`/api/goals/${id}`, { method: 'DELETE' });
      } else {
        const input = prompt(goalAdd ? 'Tambah dana sebesar (Rp):' : 'Kurangi dana sebesar (Rp):');
        if (input === null) return;
        const amount = parseRupiah(input);
        if (!amount) return alert('Nominal tidak valid');
        const saved = Math.max(0, goal.saved + (goalAdd ? amount : -amount));
        await api(`/api/goals/${id}`, { method: 'PUT', body: { ...goal, saved } });
      }
      await loadGoals();
    } catch (err) { alert(err.message); }
  });
}

async function onMonthChange() {
  if (!state.editingId) $('#txForm').elements.date.value = defaultDate();
  try { await loadMonth(); } catch (err) { alert(err.message); }
}

// Ditampilkan jika halaman dibuka langsung dari file (index.html diklik dua kali)
// atau server belum berjalan, supaya pengguna tahu harus menjalankan server.
function showStartupHelp(reason) {
  const box = document.createElement('div');
  box.className = 'startup-help';
  box.innerHTML = `<strong>Aplikasi belum terhubung ke server.</strong>
    <p>${reason}</p>
    <ol>
      <li>Buka folder aplikasi, lalu klik dua kali <code>start.bat</code> (Windows) atau <code>start.command</code> (macOS).<br>
        Atau buka Terminal/Command Prompt di folder ini dan jalankan <code>npm start</code>.</li>
      <li>Biarkan jendela server tetap terbuka.</li>
      <li>Buka alamat yang muncul di jendela itu, biasanya <a href="http://localhost:3000">http://localhost:3000</a>.</li>
    </ol>`;
  document.querySelector('main').prepend(box);
}

async function init() {
  if (location.protocol === 'file:') {
    showStartupHelp('Halaman ini dibuka langsung dari file, bukan lewat server.');
    return;
  }
  bindEvents();
  $('#txForm').elements.date.value = defaultDate();
  try {
    await Promise.all([loadMonth(), loadGoals()]);
  } catch (err) {
    if (err instanceof TypeError) showStartupHelp('Server tidak merespons. Mungkin jendela server sudah ditutup.');
    else alert('Gagal memuat data: ' + err.message);
  }
}

init();
