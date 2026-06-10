/* ─── State ─────────────────────────────────────────────────────── */
let state = {
  accounts: { checking: 0, savings: 0 },
  income: { monthly: 0, frequency: 'monthly' },
  additionalIncome: [],  // { id, name, amount, frequency }
  bills: [],             // FIXED bills: { id, name, amount, type:'essential'|'subscription', category, dueDay }
  variableBills: [],     // Variable bill definitions: { id, name, category, dueDay }
  variableBillEntries: [],// Per-month entries: { id, billId, month:'YYYY-MM', amount, estimateMin, estimateMax }
  creditCards: [],       // { id, name, balance, limit, apr, minPayment, dueDay, network, issuer, customIssuer, statementBalance, paymentAllocation }
  ccPaymentHistory: [],  // { id, cardId, month, amount, date, note }
  ccExtraAllocation: 0,
  savingsAllocation: 0,
  transactions: [],      // { id, description, amount, date, category, account, note }
  unexpected: [],        // { id, description, amount, date, category, account, note }
  goals: [],             // { id, name, target, saved, targetDate, account }
  budget: { monthlySpendingTarget: 0, monthlySavingsTarget: 0 },
  lastSeenMonth: ''      // used for new-month detection
};

const STORAGE_KEY = 'finance_tracker_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch {}
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ─── Helpers ───────────────────────────────────────────────────── */
const fmt = (n) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const CATEGORY_ICONS = {
  'Food & Dining': '🍽️',
  'Transportation': '🚗',
  'Shopping': '🛍️',
  'Entertainment': '🎬',
  'Health & Fitness': '💪',
  'Personal Care': '✂️',
  'Education': '📚',
  'Travel': '✈️',
  'Gifts & Donations': '🎁',
  'Other': '📋'
};

const BILL_ICONS = {
  'Housing': '🏠', 'Transportation': '🚗', 'Utilities': '💡',
  'Insurance': '🛡️', 'Phone': '📱', 'Internet': '🌐',
  'Streaming': '📺', 'Software': '💻', 'Gym': '🏋️', 'Other': '📋'
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTHS[parseInt(m)-1]} ${y}`;
}

function getTransactionsForMonth(key) {
  return state.transactions.filter(t => t.date.startsWith(key));
}

function totalAdditionalIncome() {
  return (state.additionalIncome || []).reduce((s, i) => s + i.amount, 0);
}

function totalMonthlyIncome() {
  return state.income.monthly + totalAdditionalIncome();
}

function totalCCDebt() {
  return (state.creditCards || []).reduce((s, c) => s + c.balance, 0);
}

function totalCCMinPayments() {
  return (state.creditCards || []).reduce((s, c) => s + c.minPayment, 0);
}

function totalCCMonthlyCommitment() {
  return totalCCMinPayments() + (state.ccExtraAllocation || 0);
}

function totalBills() {
  return state.bills.reduce((s, b) => s + b.amount, 0);
}

function totalEssential() {
  return state.bills.filter(b => b.type === 'essential').reduce((s, b) => s + b.amount, 0);
}

function totalSubscriptions() {
  return state.bills.filter(b => b.type === 'subscription').reduce((s, b) => s + b.amount, 0);
}

// Variable bills for a given month key
function getVariableEntries(monthKey) {
  return (state.variableBillEntries || []).filter(e => e.month === monthKey);
}

function totalVariableBills(monthKey) {
  return getVariableEntries(monthKey).reduce((s, e) => s + (e.amount || 0), 0);
}

function totalVariableEstimate(monthKey) {
  // returns { min, max } using estimate ranges when actual not set
  const entries = getVariableEntries(monthKey);
  let min = 0, max = 0;
  entries.forEach(e => {
    if (e.amount) { min += e.amount; max += e.amount; }
    else { min += e.estimateMin || 0; max += e.estimateMax || e.estimateMin || 0; }
  });
  return { min, max };
}

function totalAllBills(monthKey) {
  return totalBills() + totalVariableBills(monthKey || currentMonthKey());
}

function discretionaryBudget() {
  const savingsOut = Math.max(state.budget?.monthlySavingsTarget || 0, state.savingsAllocation || 0);
  return totalMonthlyIncome() - totalAllBills() - totalCCMonthlyCommitment() - savingsOut;
}

function weeklyBudget() {
  return discretionaryBudget() / 4.33;
}

function spentThisMonth() {
  return getTransactionsForMonth(currentMonthKey()).reduce((s, t) => s + t.amount, 0);
}

function availableToSpend() {
  return discretionaryBudget() - spentThisMonth();
}

function totalBalance() {
  return state.accounts.checking + state.accounts.savings;
}

/* ─── Navigation ────────────────────────────────────────────────── */
function navigate(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const el = document.getElementById('section-' + section);
  if (el) el.classList.add('active');

  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (link) link.classList.add('active');

  document.getElementById('section-title').textContent = {
    dashboard: 'Dashboard',
    accounts: 'Accounts',
    bills: 'Bills',
    creditcards: 'Credit Cards',
    spending: 'Spending',
    budget: 'Budget',
    outlook: 'Outlook',
    unexpected: 'Unexpected Expenses',
    goals: 'Savings Goals'
  }[section] || section;

  renderSection(section);
}

function renderSection(section) {
  if (section === 'dashboard') renderDashboard();
  if (section === 'accounts') renderAccounts();
  if (section === 'bills') renderBills();
  if (section === 'creditcards') renderCreditCards();
  if (section === 'spending') renderSpending();
  if (section === 'budget') renderBudget();
  if (section === 'outlook') renderOutlook();
  if (section === 'unexpected') renderUnexpected();
  if (section === 'goals') renderGoals();
}

/* ─── Dashboard ─────────────────────────────────────────────────── */
let billsChart, spendingDonutChart;

function renderDashboard() {
  const key = currentMonthKey();
  const spent = spentThisMonth();
  const disc = discretionaryBudget();
  const avail = availableToSpend();
  const wkly = weeklyBudget();
  const txs = getTransactionsForMonth(key);

  // cards
  document.getElementById('dash-total-balance').textContent = fmt(totalBalance());
  document.getElementById('dash-available').textContent = fmt(Math.max(0, avail));
  document.getElementById('dash-monthly-left').textContent = fmt(Math.max(0, disc - spent));
  document.getElementById('dash-weekly').textContent = fmt(Math.max(0, wkly));

  // bills summary
  const essential = totalEssential();
  const subs = totalSubscriptions();
  const bills = totalBills();
  document.getElementById('dash-essential-total').textContent = fmt(essential);
  document.getElementById('dash-subscription-total').textContent = fmt(subs);
  document.getElementById('dash-bills-sum').textContent = fmt(bills);
  document.getElementById('dash-bills-total').textContent = fmt(bills) + '/mo';

  // spending stats
  document.getElementById('dash-spent').textContent = fmt(spent);
  document.getElementById('dash-budgeted').textContent = fmt(disc);
  document.getElementById('dash-remaining').textContent = fmt(Math.max(0, disc - spent));
  document.getElementById('dash-spent-badge').textContent = fmt(spent) + ' spent';

  // Bills donut
  const billCtx = document.getElementById('bills-chart').getContext('2d');
  if (billsChart) billsChart.destroy();
  if (bills > 0) {
    billsChart = new Chart(billCtx, {
      type: 'doughnut',
      data: {
        labels: ['Essential', 'Subscriptions'],
        datasets: [{
          data: [essential, subs],
          backgroundColor: ['#ef4444', '#f59e0b'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        plugins: { legend: { labels: { color: '#7a8099', font: { size: 11 } } } },
        cutout: '65%'
      }
    });
  }

  // Spending doughnut
  const spendCtx = document.getElementById('spending-chart').getContext('2d');
  if (spendingDonutChart) spendingDonutChart.destroy();
  const pct = disc > 0 ? Math.min(100, (spent / disc) * 100) : 0;
  spendingDonutChart = new Chart(spendCtx, {
    type: 'doughnut',
    data: {
      labels: ['Spent', 'Remaining'],
      datasets: [{
        data: [spent, Math.max(0, disc - spent)],
        backgroundColor: [pct > 90 ? '#ef4444' : '#4f8ef7', '#1e2330'],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      cutout: '70%'
    }
  });

  // Recent transactions (last 8)
  const recent = [...state.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);
  const container = document.getElementById('recent-transactions');
  container.innerHTML = recent.length ? recent.map(tx => txHTML(tx)).join('') : '<div class="empty-state">No transactions yet. Add one to get started.</div>';
}

function txHTML(tx) {
  const icon = CATEGORY_ICONS[tx.category] || '📋';
  const catClass = getCatClass(tx.category);
  return `<div class="tx-item">
    <div class="tx-item-left">
      <div class="tx-icon ${catClass}">${icon}</div>
      <div class="tx-info">
        <div class="tx-name">${tx.description}</div>
        <div class="tx-meta">${tx.category} &middot; ${formatDate(tx.date)} &middot; ${tx.account}</div>
      </div>
    </div>
    <div class="tx-item-right">
      <span class="tx-amount amount-red">-${fmt(tx.amount)}</span>
      <div class="tx-actions">
        <button onclick="editTransaction('${tx.id}')" title="Edit">&#9998;</button>
        <button onclick="deleteTransaction('${tx.id}')" title="Delete">&#10005;</button>
      </div>
    </div>
  </div>`;
}

function getCatClass(cat) {
  const m = { 'Food & Dining': 'cat-food', 'Transportation': 'cat-transport', 'Shopping': 'cat-shopping', 'Entertainment': 'cat-entertainment', 'Health & Fitness': 'cat-health' };
  return m[cat] || 'cat-other';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
}

/* ─── Accounts ──────────────────────────────────────────────────── */
function renderAccounts() {
  document.getElementById('checking-display').textContent = fmt(state.accounts.checking);
  document.getElementById('savings-display').textContent = fmt(state.accounts.savings);
  document.getElementById('total-balance-display').textContent = fmt(totalBalance());

  const wkly = state.income.frequency === 'weekly' ? state.income.monthly / 4.33 :
               state.income.frequency === 'biweekly' ? state.income.monthly / 2.17 :
               state.income.monthly;

  document.getElementById('income-display').innerHTML = `
    <div class="income-item">
      <div class="income-item-label">Primary Take-Home</div>
      <div class="income-item-value">${fmt(state.income.monthly)}</div>
    </div>
    <div class="income-item">
      <div class="income-item-label">Per Paycheck (${state.income.frequency})</div>
      <div class="income-item-value">${fmt(wkly)}</div>
    </div>
    <div class="income-item">
      <div class="income-item-label">Additional Income</div>
      <div class="income-item-value">${fmt(totalAdditionalIncome())}</div>
    </div>
    <div class="income-item">
      <div class="income-item-label">Total Monthly Income</div>
      <div class="income-item-value" style="color:#4f8ef7">${fmt(totalMonthlyIncome())}</div>
    </div>
    <div class="income-item">
      <div class="income-item-label">After Bills</div>
      <div class="income-item-value">${fmt(Math.max(0, discretionaryBudget()))}</div>
    </div>
  `;

  // Additional income list
  const addlList = document.getElementById('additional-income-list');
  const addlIncome = state.additionalIncome || [];
  addlList.innerHTML = addlIncome.length ? addlIncome.map(i => `
    <div class="bill-item">
      <div class="bill-item-left">
        <span class="bill-name">💰 ${i.name}</span>
        <span class="bill-meta">${i.frequency}</span>
      </div>
      <div class="bill-item-right">
        <span class="bill-amount" style="color:#2ec47a">+${fmt(i.amount)}/mo</span>
        <div class="bill-actions">
          <button onclick="editAdditionalIncome('${i.id}')" title="Edit">&#9998;</button>
          <button onclick="deleteAdditionalIncome('${i.id}')" title="Delete">&#10005;</button>
        </div>
      </div>
    </div>
  `).join('') : '<div class="empty-state">No additional income sources added.</div>';
}

/* ─── Bills ─────────────────────────────────────────────────────── */
function renderBills() {
  const key = currentMonthKey();
  const lbl = document.getElementById('variable-month-label');
  if (lbl) lbl.textContent = monthLabel(key);
  const essential = state.bills.filter(b => b.type === 'essential');
  const subs = state.bills.filter(b => b.type === 'subscription');

  const renderList = (bills, containerId) => {
    const el = document.getElementById(containerId);
    el.innerHTML = bills.length ? bills.map(b => `
      <div class="bill-item">
        <div class="bill-item-left">
          <span class="bill-name">${BILL_ICONS[b.category] || '📋'} ${b.name}</span>
          <span class="bill-meta">${b.category} &middot; Due day ${b.dueDay || 'N/A'}</span>
        </div>
        <div class="bill-item-right">
          <span class="bill-amount">-${fmt(b.amount)}</span>
          <div class="bill-actions">
            <button onclick="editBill('${b.id}')" title="Edit">&#9998;</button>
            <button onclick="deleteBill('${b.id}')" title="Delete">&#10005;</button>
          </div>
        </div>
      </div>
    `).join('') : '<div class="empty-state">No bills added yet.</div>';
  };

  renderList(essential, 'essential-bills-list');
  renderList(subs, 'subscription-bills-list');

  // ── Variable bills ──────────────────────────────────────────────
  const varDefs = state.variableBills || [];
  const varEntries = getVariableEntries(key);
  const varList = document.getElementById('variable-bills-list');

  varList.innerHTML = varDefs.length ? varDefs.map(vb => {
    const entry = varEntries.find(e => e.billId === vb.id);
    const hasActual = entry && entry.amount > 0;
    const hasEstimate = entry && (entry.estimateMin > 0 || entry.estimateMax > 0);
    let statusBadge, amountDisplay;

    if (hasActual) {
      statusBadge = '<span class="vb-badge vb-badge-actual">Actual</span>';
      amountDisplay = `<span class="bill-amount">-${fmt(entry.amount)}</span>`;
    } else if (hasEstimate) {
      statusBadge = '<span class="vb-badge vb-badge-estimate">Estimated</span>';
      amountDisplay = `<span class="bill-amount" style="color:#f59e0b">${fmt(entry.estimateMin)}–${fmt(entry.estimateMax)}</span>`;
    } else {
      statusBadge = '<span class="vb-badge vb-badge-pending">Not entered</span>';
      amountDisplay = `<span class="bill-amount" style="color:#7a8099">—</span>`;
    }

    return `
      <div class="bill-item">
        <div class="bill-item-left">
          <span class="bill-name">${BILL_ICONS[vb.category] || '📋'} ${vb.name} ${statusBadge}</span>
          <span class="bill-meta">${vb.category} &middot; Due day ${vb.dueDay || 'N/A'}</span>
        </div>
        <div class="bill-item-right">
          ${amountDisplay}
          <div class="bill-actions">
            <button onclick="openEnterVariableBill('${vb.id}')" title="Enter amount" style="color:#4f8ef7">&#9998; Enter</button>
            <button onclick="editVariableBillDef('${vb.id}')" title="Edit definition">&#9881;</button>
            <button onclick="deleteVariableBillDef('${vb.id}')" title="Delete">&#10005;</button>
          </div>
        </div>
      </div>`;
  }).join('') : '<div class="empty-state">No variable bills added yet.</div>';

  // Variable totals
  const varTotal = totalVariableBills(key);
  const est = totalVariableEstimate(key);
  document.getElementById('variable-total-footer').textContent =
    varTotal > 0 ? fmt(varTotal) : (est.min > 0 ? `${fmt(est.min)} – ${fmt(est.max)} (est.)` : '$0.00');

  // ── Bill History ────────────────────────────────────────────────
  renderBillHistory();

  document.getElementById('essential-total-footer').textContent = fmt(totalEssential());
  document.getElementById('subscription-total-footer').textContent = fmt(totalSubscriptions());

  renderSavingsAlloc();
}

function renderSavingsAlloc() {
  const savingsAlloc = state.savingsAllocation || 0;
  const el = document.getElementById('savings-alloc-input');
  if (!el) return;
  el.value = savingsAlloc || '';
  document.getElementById('savings-alloc-balance').textContent = fmt(state.accounts.savings);
  document.getElementById('savings-alloc-projected').textContent = fmt(state.accounts.savings + savingsAlloc);
  document.getElementById('savings-alloc-remaining').textContent = fmt(Math.max(0, discretionaryBudget()));
}

function renderBillHistory() {
  // Collect all months that have variable entries OR fixed bills exist
  const allMonths = new Set((state.variableBillEntries || []).map(e => e.month));
  // Also add last 6 months so fixed-bill history always shows
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    allMonths.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const sortedMonths = [...allMonths].sort().reverse().slice(0, 12);
  const fixedTotal = totalBills();
  const varDefs = state.variableBills || [];

  const histEl = document.getElementById('bill-history-table');
  if (sortedMonths.length === 0) {
    histEl.innerHTML = '<div class="empty-state">No history yet.</div>';
    return;
  }

  histEl.innerHTML = `<table class="outlook-table">
    <thead><tr>
      <th>Month</th>
      <th>Fixed Bills</th>
      <th>Variable Bills</th>
      <th>CC Payments</th>
      <th>Total</th>
      <th>Notes</th>
    </tr></thead>
    <tbody>${sortedMonths.map(m => {
      const varActual = totalVariableBills(m);
      const est = totalVariableEstimate(m);
      const entries = getVariableEntries(m);
      const allEntered = varDefs.length === 0 || varDefs.every(vb => entries.find(e => e.billId === vb.id && e.amount > 0));
      const varDisplay = varActual > 0 ? fmt(varActual)
        : est.min > 0 ? `<span style="color:#f59e0b">${fmt(est.min)}–${fmt(est.max)}</span>`
        : '<span style="color:#7a8099">—</span>';

      const ccPayments = totalCCMinPayments() + (state.ccExtraAllocation || 0);
      const total = fixedTotal + varActual + ccPayments;
      const isCurrent = m === currentMonthKey();

      // Build per-variable-bill notes
      const noteItems = entries.filter(e => e.amount > 0).map(e => {
        const def = varDefs.find(vb => vb.id === e.billId);
        return def ? `${def.name}: ${fmt(e.amount)}` : '';
      }).filter(Boolean);

      return `<tr${isCurrent ? ' style="background:rgba(79,142,247,0.07)"' : ''}>
        <td><strong>${monthLabel(m)}</strong>${isCurrent ? ' <span style="color:#4f8ef7;font-size:10px">(current)</span>' : ''}</td>
        <td>${fmt(fixedTotal)}</td>
        <td>${varDisplay}${!allEntered && varDefs.length > 0 ? ' <span style="color:#f59e0b;font-size:10px">⚠ incomplete</span>' : ''}</td>
        <td>${fmt(ccPayments)}</td>
        <td><strong>${varActual > 0 ? fmt(total) : (est.min > 0 ? `${fmt(fixedTotal+est.min+ccPayments)}–${fmt(fixedTotal+est.max+ccPayments)}` : fmt(fixedTotal+ccPayments))}</strong></td>
        <td style="font-size:11px;color:#7a8099">${noteItems.join(', ') || '—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// Variable bill definition modal
function openAddVariableBillDef() {
  document.getElementById('vb-def-edit-id').value = '';
  document.getElementById('vb-def-name').value = '';
  document.getElementById('vb-def-category').value = 'Utilities';
  document.getElementById('vb-def-due-day').value = '';
  document.getElementById('modal-vb-def-title').textContent = 'Add Variable Bill';
  openModal('modal-vb-def');
}

function editVariableBillDef(id) {
  const vb = (state.variableBills || []).find(v => v.id === id);
  if (!vb) return;
  document.getElementById('vb-def-edit-id').value = vb.id;
  document.getElementById('vb-def-name').value = vb.name;
  document.getElementById('vb-def-category').value = vb.category;
  document.getElementById('vb-def-due-day').value = vb.dueDay || '';
  document.getElementById('modal-vb-def-title').textContent = 'Edit Variable Bill';
  openModal('modal-vb-def');
}

function saveVariableBillDef() {
  const name = document.getElementById('vb-def-name').value.trim();
  const category = document.getElementById('vb-def-category').value;
  const dueDay = parseInt(document.getElementById('vb-def-due-day').value) || null;
  const editId = document.getElementById('vb-def-edit-id').value;
  if (!name) return alert('Please enter a bill name.');
  if (!state.variableBills) state.variableBills = [];
  if (editId) {
    const idx = state.variableBills.findIndex(v => v.id === editId);
    if (idx >= 0) state.variableBills[idx] = { ...state.variableBills[idx], name, category, dueDay };
  } else {
    state.variableBills.push({ id: uid(), name, category, dueDay });
  }
  saveState();
  closeModal('modal-vb-def');
  renderSection(currentSection());
}

function deleteVariableBillDef(id) {
  if (!confirm('Delete this variable bill? All monthly entries for it will also be removed.')) return;
  state.variableBills = (state.variableBills || []).filter(v => v.id !== id);
  state.variableBillEntries = (state.variableBillEntries || []).filter(e => e.billId !== id);
  saveState();
  renderSection(currentSection());
}

// Enter monthly amount for a variable bill
function openEnterVariableBill(billId) {
  const vb = (state.variableBills || []).find(v => v.id === billId);
  if (!vb) return;
  const key = currentMonthKey();
  const existing = (state.variableBillEntries || []).find(e => e.billId === billId && e.month === key);

  document.getElementById('vb-entry-bill-id').value = billId;
  document.getElementById('vb-entry-month').value = key;
  document.getElementById('vb-entry-bill-name').textContent = `${vb.name} — ${monthLabel(key)}`;
  document.getElementById('vb-entry-amount').value = existing?.amount || '';
  document.getElementById('vb-entry-est-min').value = existing?.estimateMin || '';
  document.getElementById('vb-entry-est-max').value = existing?.estimateMax || '';
  openModal('modal-vb-entry');
}

function saveVariableBillEntry() {
  const billId = document.getElementById('vb-entry-bill-id').value;
  const month = document.getElementById('vb-entry-month').value;
  const amount = parseFloat(document.getElementById('vb-entry-amount').value) || 0;
  const estimateMin = parseFloat(document.getElementById('vb-entry-est-min').value) || 0;
  const estimateMax = parseFloat(document.getElementById('vb-entry-est-max').value) || 0;

  if (!state.variableBillEntries) state.variableBillEntries = [];
  const idx = state.variableBillEntries.findIndex(e => e.billId === billId && e.month === month);
  const entry = { id: uid(), billId, month, amount, estimateMin, estimateMax };
  if (idx >= 0) state.variableBillEntries[idx] = { ...state.variableBillEntries[idx], amount, estimateMin, estimateMax };
  else state.variableBillEntries.push(entry);

  saveState();
  closeModal('modal-vb-entry');
  renderSection(currentSection());
}

// New-month notification check
function checkNewMonth() {
  const key = currentMonthKey();
  const last = state.lastSeenMonth || '';
  if (last && last !== key) {
    // New month detected — show notification banner
    const varDefs = state.variableBills || [];
    if (varDefs.length > 0) {
      const banner = document.getElementById('new-month-banner');
      if (banner) {
        banner.style.display = 'flex';
        document.getElementById('new-month-label').textContent =
          `It's a new month (${monthLabel(key)})! Please enter your variable bill amounts.`;
      }
    }
  }
  state.lastSeenMonth = key;
  saveState();
}

/* ─── Spending ──────────────────────────────────────────────────── */
let categoryChart, monthlyHistoryChart;

function renderSpending() {
  const filterMonth = document.getElementById('filter-month').value;
  const filterCat = document.getElementById('filter-category').value;

  let txs = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (filterMonth) txs = txs.filter(t => t.date.startsWith(filterMonth));
  if (filterCat) txs = txs.filter(t => t.category === filterCat);

  const list = document.getElementById('spending-list');
  list.innerHTML = txs.length ? txs.map(tx => txHTML(tx)).join('') : '<div class="empty-state">No transactions for this period.</div>';

  // category breakdown chart
  const catCtx = document.getElementById('category-chart').getContext('2d');
  if (categoryChart) categoryChart.destroy();

  const catTotals = {};
  txs.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catLabels = Object.keys(catTotals);
  const catData = catLabels.map(k => catTotals[k]);
  const colors = ['#4f8ef7','#f59e0b','#a855f7','#2ec47a','#ef4444','#06b6d4','#f97316','#84cc16','#e879f9','#7a8099'];

  categoryChart = new Chart(catCtx, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{ data: catData, backgroundColor: colors.slice(0, catLabels.length), borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      plugins: { legend: { position: 'right', labels: { color: '#7a8099', font: { size: 11 }, padding: 8 } } },
      cutout: '55%'
    }
  });

  // monthly history chart
  const histCtx = document.getElementById('monthly-history-chart').getContext('2d');
  if (monthlyHistoryChart) monthlyHistoryChart.destroy();

  const monthlyTotals = {};
  state.transactions.forEach(t => {
    const key = t.date.slice(0, 7);
    monthlyTotals[key] = (monthlyTotals[key] || 0) + t.amount;
  });

  const sortedMonths = Object.keys(monthlyTotals).sort().slice(-12);
  monthlyHistoryChart = new Chart(histCtx, {
    type: 'bar',
    data: {
      labels: sortedMonths.map(k => monthLabel(k).slice(0, 7)),
      datasets: [{
        label: 'Spending',
        data: sortedMonths.map(k => monthlyTotals[k]),
        backgroundColor: '#4f8ef7',
        borderRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a8099', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#7a8099', font: { size: 10 }, callback: v => '$' + v.toLocaleString() }, grid: { color: '#2a2f3d' } }
      }
    }
  });
}

/* ─── Budget ────────────────────────────────────────────────────── */
let budgetVsSpendChart;

function renderBudget() {
  const inc = totalMonthlyIncome();
  const bills = totalBills();
  const disc = discretionaryBudget();
  const wkly = weeklyBudget();
  const spent = spentThisMonth();
  const spendTarget = state.budget?.monthlySpendingTarget || 0;
  const saveTarget = state.budget?.monthlySavingsTarget || 0;

  document.getElementById('budget-income').textContent = fmt(inc);
  document.getElementById('budget-bills').textContent = fmt(bills);
  document.getElementById('budget-discretionary').textContent = fmt(Math.max(0, disc));
  document.getElementById('budget-weekly').textContent = fmt(Math.max(0, wkly));

  // Spending target inputs
  document.getElementById('budget-spend-target').value = spendTarget || '';
  document.getElementById('budget-savings-target').value = saveTarget || '';

  // breakdown
  const breakdown = document.getElementById('budget-breakdown');
  const billsPct   = inc > 0 ? (bills / inc) * 100 : 0;
  const savePct    = inc > 0 ? (saveTarget / inc) * 100 : 0;
  const spendPct   = inc > 0 ? (spent / inc) * 100 : 0;
  const targetPct  = inc > 0 ? (spendTarget / inc) * 100 : 0;
  const remaining  = inc - bills - saveTarget - spent;
  const remainPct  = inc > 0 ? Math.max(0, (remaining / inc) * 100) : 0;

  const spendVsTarget = spendTarget > 0
    ? `<span style="color:${spent > spendTarget ? '#ef4444' : '#2ec47a'}">${fmt(spent)} of ${fmt(spendTarget)} target</span>`
    : `<span>${fmt(spent)} spent</span>`;

  breakdown.innerHTML = `
    <div class="budget-item">
      <div class="budget-item-header"><span>Bills &amp; Subscriptions</span><span>${fmt(bills)} (${billsPct.toFixed(0)}%)</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(100,billsPct)}%;background:#ef4444"></div></div>
    </div>
    <div class="budget-item">
      <div class="budget-item-header"><span>Monthly Savings Target</span><span style="color:#a855f7">${fmt(saveTarget)} (${savePct.toFixed(0)}%)</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(100,savePct)}%;background:#a855f7"></div></div>
    </div>
    <div class="budget-item">
      <div class="budget-item-header"><span>Discretionary Spending</span>${spendVsTarget}</div>
      <div class="budget-bar-track">
        ${spendTarget > 0
          ? `<div class="budget-bar-fill" style="width:${Math.min(100,targetPct)}%;background:#1e3a5f;position:relative"></div>`
          : ''}
        <div class="budget-bar-fill" style="width:${Math.min(100,spendPct)}%;background:${spent > spendTarget && spendTarget > 0 ? '#ef4444' : '#f59e0b'};margin-top:${spendTarget > 0 ? '-8px' : '0'}"></div>
      </div>
    </div>
    <div class="budget-item">
      <div class="budget-item-header"><span>Remaining</span><span style="color:${remaining >= 0 ? '#2ec47a' : '#ef4444'}">${fmt(Math.abs(remaining))} ${remaining < 0 ? 'over' : 'left'}</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(100,remainPct)}%;background:#2ec47a"></div></div>
    </div>
  `;

  // per-category spending chart
  const catCtx = document.getElementById('budget-vs-spend-chart').getContext('2d');
  if (budgetVsSpendChart) budgetVsSpendChart.destroy();

  const key = currentMonthKey();
  const txs = getTransactionsForMonth(key);
  const catTotals = {};
  txs.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const cats = Object.keys(catTotals);
  const datasets = [{
    label: 'Spent This Month',
    data: cats.map(c => catTotals[c]),
    backgroundColor: '#4f8ef7',
    borderRadius: 4
  }];

  if (spendTarget > 0 && cats.length > 0) {
    const perCat = spendTarget / cats.length;
    datasets.push({
      label: 'Target (even split)',
      data: cats.map(() => perCat),
      backgroundColor: 'rgba(245,158,11,0.25)',
      borderRadius: 4
    });
  }

  budgetVsSpendChart = new Chart(catCtx, {
    type: 'bar',
    data: { labels: cats, datasets },
    options: {
      indexAxis: 'y',
      plugins: { legend: { labels: { color: '#7a8099', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#7a8099', font: { size: 10 }, callback: v => '$' + v }, grid: { color: '#2a2f3d' } },
        y: { ticks: { color: '#7a8099', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });

  // progress bars - all categories
  const progressList = document.getElementById('budget-progress-list');
  if (cats.length === 0) {
    progressList.innerHTML = '<div class="empty-state">No spending recorded this month.</div>';
    return;
  }

  const budgetPerCat = spendTarget > 0 ? spendTarget / cats.length : (disc > 0 ? disc / cats.length : 0);
  progressList.innerHTML = cats.map(cat => {
    const s = catTotals[cat];
    const pct = budgetPerCat > 0 ? Math.min(100, (s / budgetPerCat) * 100) : 0;
    const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#2ec47a';
    const budgetLabel = budgetPerCat > 0 ? ` of ${fmt(budgetPerCat)}` : '';
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span>${CATEGORY_ICONS[cat] || ''} ${cat}</span>
          <span>${fmt(s)}${budgetLabel}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
    `;
  }).join('');
}

function saveBudgetTargets() {
  const spendTarget = parseFloat(document.getElementById('budget-spend-target').value) || 0;
  const saveTarget = parseFloat(document.getElementById('budget-savings-target').value) || 0;
  state.budget = { monthlySpendingTarget: spendTarget, monthlySavingsTarget: saveTarget };
  saveState();
  renderBudget();
  renderDashboard();
}

/* ─── Outlook ───────────────────────────────────────────────────── */
let outlookChart;

function renderOutlook() {
  const months = parseInt(document.getElementById('outlook-months').value);
  const savingsRate = parseFloat(document.getElementById('outlook-savings-rate').value);

  const inc = totalMonthlyIncome();
  // Fixed bills + variable bill HIGH estimate (conservative/accurate projection)
  const varEst = totalVariableEstimate(currentMonthKey());
  const varHighMonthly = varEst.max > 0 ? varEst.max : totalVariableBills(currentMonthKey());
  const bills = totalBills() + varHighMonthly + totalCCMonthlyCommitment();
  const disc = discretionaryBudget();

  // Calculate average monthly spending from last 3 months
  const now = new Date();
  let totalSpent = 0;
  let countedMonths = 0;
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const spent = getTransactionsForMonth(key).reduce((s, t) => s + t.amount, 0);
    if (spent > 0) { totalSpent += spent; countedMonths++; }
  }
  const avgSpending = countedMonths > 0 ? totalSpent / countedMonths : disc * 0.7;

  // Build projection
  let checkingBalance = state.accounts.checking;
  let savingsBalance = state.accounts.savings;
  const rows = [];
  const labels = [];
  const checkingData = [];
  const savingsData = [];
  const totalData = [];

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const label = `${MONTHS[d.getMonth()].slice(0,3)} ${d.getFullYear()}`;
    labels.push(label);

    const savingsContrib = (state.budget?.monthlySavingsTarget || 0) > 0
      ? state.budget.monthlySavingsTarget
      : inc * savingsRate;
    const spendBudget = (state.budget?.monthlySpendingTarget || 0) > 0
      ? state.budget.monthlySpendingTarget
      : avgSpending;
    const netChange = inc - bills - spendBudget - savingsContrib;
    checkingBalance += netChange;
    savingsBalance += savingsContrib;

    rows.push({ label, income: inc, bills, spending: spendBudget, savings: savingsContrib, checkingBalance, savingsBalance, total: checkingBalance + savingsBalance });
    checkingData.push(Math.max(0, checkingBalance));
    savingsData.push(Math.max(0, savingsBalance));
    totalData.push(Math.max(0, checkingBalance + savingsBalance));
  }

  // Chart
  const ctx = document.getElementById('outlook-chart').getContext('2d');
  if (outlookChart) outlookChart.destroy();
  outlookChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Total Balance', data: totalData, borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.1)', fill: true, tension: 0.3, pointRadius: 3 },
        { label: 'Checking', data: checkingData, borderColor: '#2ec47a', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 },
        { label: 'Savings', data: savingsData, borderColor: '#a855f7', backgroundColor: 'transparent', tension: 0.3, pointRadius: 3 }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#7a8099', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#7a8099', font: { size: 10 } }, grid: { color: '#2a2f3d' } },
        y: { ticks: { color: '#7a8099', font: { size: 10 }, callback: v => '$' + v.toLocaleString() }, grid: { color: '#2a2f3d' } }
      }
    }
  });

  // Table
  const tableWrap = document.getElementById('outlook-table');
  tableWrap.innerHTML = `<table class="outlook-table">
    <thead><tr>
      <th>Month</th><th>Income</th><th>Bills</th><th>Est. Spend</th><th>To Savings</th><th>Checking</th><th>Savings</th><th>Total</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${r.label}</td>
      <td>${fmt(r.income)}</td>
      <td style="color:#ef4444">${fmt(r.bills)}</td>
      <td style="color:#f59e0b">${fmt(r.spending)}</td>
      <td style="color:#a855f7">${fmt(r.savings)}</td>
      <td style="color:#2ec47a">${fmt(Math.max(0,r.checkingBalance))}</td>
      <td style="color:#a855f7">${fmt(Math.max(0,r.savingsBalance))}</td>
      <td style="font-weight:600">${fmt(Math.max(0,r.total))}</td>
    </tr>`).join('')}</tbody>
  </table>`;

  // Summary
  const lastRow = rows[rows.length - 1];
  const firstRow = rows[0];
  const totalGrowth = lastRow.total - (state.accounts.checking + state.accounts.savings);
  const totalSavingsAdded = rows.reduce((s, r) => s + r.savings, 0);

  document.getElementById('outlook-summary').innerHTML = `
    <div class="outlook-stat">
      <span class="outlook-stat-label">Projected Total in ${months} months</span>
      <span class="outlook-stat-value" style="color:#4f8ef7">${fmt(Math.max(0, lastRow.total))}</span>
    </div>
    <div class="outlook-stat">
      <span class="outlook-stat-label">Projected Checking Balance</span>
      <span class="outlook-stat-value" style="color:#2ec47a">${fmt(Math.max(0, lastRow.checkingBalance))}</span>
    </div>
    <div class="outlook-stat">
      <span class="outlook-stat-label">Projected Savings Balance</span>
      <span class="outlook-stat-value" style="color:#a855f7">${fmt(Math.max(0, lastRow.savingsBalance))}</span>
    </div>
    <div class="outlook-stat">
      <span class="outlook-stat-label">Total Saved Over Period</span>
      <span class="outlook-stat-value" style="color:#a855f7">${fmt(totalSavingsAdded)}</span>
    </div>
    <div class="outlook-stat">
      <span class="outlook-stat-label">Net Change</span>
      <span class="outlook-stat-value" style="color:${totalGrowth >= 0 ? '#2ec47a' : '#ef4444'}">${totalGrowth >= 0 ? '+' : ''}${fmt(totalGrowth)}</span>
    </div>
    <div class="outlook-stat">
      <span class="outlook-stat-label">Avg Monthly Spending Used</span>
      <span class="outlook-stat-value" style="color:#f59e0b">${fmt(avgSpending)}</span>
    </div>
  `;
}

/* ─── Goals ─────────────────────────────────────────────────────── */
function renderGoals() {
  const list = document.getElementById('goals-list');
  if (state.goals.length === 0) {
    list.innerHTML = '<div class="empty-state">No goals yet. Add a savings goal to get started.</div>';
    document.getElementById('goals-plan').innerHTML = '';
    return;
  }

  const now = new Date();

  list.innerHTML = state.goals.map(g => {
    // If monthly contribution is set, calculate saved based on contributions
    const effectiveSaved = g.monthlyContrib > 0 ? g.saved : g.saved;
    const pct = g.target > 0 ? Math.min(100, (effectiveSaved / g.target) * 100) : 0;
    const remaining = Math.max(0, g.target - effectiveSaved);

    // Determine months left / per-month needed
    let monthsLeftStr = '', perMonthStr = '';
    if (g.targetDate) {
      const td = new Date(g.targetDate + 'T00:00:00');
      const mo = Math.max(1, (td.getFullYear() - now.getFullYear()) * 12 + (td.getMonth() - now.getMonth()));
      const perMonth = remaining > 0 ? remaining / mo : 0;
      monthsLeftStr = `${mo} months left`;
      perMonthStr = `${fmt(perMonth)}/mo needed`;
    } else if (g.monthlyContrib > 0) {
      const mo = g.monthlyContrib > 0 ? Math.ceil(remaining / g.monthlyContrib) : null;
      monthsLeftStr = mo ? `~${formatMonths(mo)} at current rate` : '';
      perMonthStr = `${fmt(g.monthlyContrib)}/mo set`;
    } else {
      monthsLeftStr = 'No target date set';
      perMonthStr = '';
    }

    const metaSub = g.targetDate ? `Target: ${formatDate(g.targetDate)}` : 'No target date';

    return `
      <div class="goal-item">
        <div class="goal-header">
          <div>
            <div class="goal-name">${g.name}</div>
            <div class="goal-meta">${g.account} account &middot; ${metaSub}${g.monthlyContrib > 0 ? ' &middot; ' + fmt(g.monthlyContrib) + '/mo' : ''}</div>
          </div>
          <div class="goal-actions">
            <button onclick="editGoal('${g.id}')" title="Edit">&#9998;</button>
            <button onclick="deleteGoal('${g.id}')" title="Delete">&#10005;</button>
          </div>
        </div>
        <div class="goal-progress-track">
          <div class="goal-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-stats">
          <span>${fmt(effectiveSaved)} saved of ${fmt(g.target)}</span>
          <span>${pct.toFixed(0)}% complete</span>
          <span>${fmt(remaining)} to go</span>
        </div>
        ${monthsLeftStr ? `<div style="margin-top:6px;font-size:11px;color:#7a8099">${monthsLeftStr}${perMonthStr ? ' &middot; ' + perMonthStr : ''}</div>` : ''}
      </div>
    `;
  }).join('');

  // Plan section
  const planEl = document.getElementById('goals-plan');
  planEl.innerHTML = state.goals.map(g => {
    const remaining = Math.max(0, g.target - g.saved);
    let perMonth = 0, detail = '';

    if (g.monthlyContrib > 0) {
      perMonth = g.monthlyContrib;
      const mo = perMonth > 0 ? Math.ceil(remaining / perMonth) : null;
      detail = mo ? `~${formatMonths(mo)} to go` : 'Ongoing';
    } else if (g.targetDate) {
      const td = new Date(g.targetDate + 'T00:00:00');
      const mo = Math.max(1, (td.getFullYear() - now.getFullYear()) * 12 + (td.getMonth() - now.getMonth()));
      perMonth = remaining / mo;
      detail = `${mo} months remaining`;
    } else {
      return `<div class="goal-plan-row"><div><strong>${g.name}</strong><div style="font-size:11px;color:#7a8099">No target date or monthly contribution set</div></div><div class="goal-plan-monthly">—</div></div>`;
    }

    return `
      <div class="goal-plan-row">
        <div>
          <strong>${g.name}</strong>
          <div style="font-size:11px;color:#7a8099;margin-top:2px">${detail} &middot; ${fmt(remaining)} left</div>
        </div>
        <div class="goal-plan-monthly">${fmt(perMonth)}/mo</div>
      </div>
    `;
  }).join('');
}

/* ─── Modals ────────────────────────────────────────────────────── */
function openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById('modal-overlay').classList.add('hidden');
}

// Transaction
function openAddTransaction() {
  document.getElementById('modal-transaction-title').textContent = 'Add Transaction';
  document.getElementById('tx-edit-id').value = '';
  document.getElementById('tx-description').value = '';
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('tx-category').value = 'Food & Dining';
  document.getElementById('tx-account').value = 'checking';
  document.getElementById('tx-note').value = '';
  openModal('modal-transaction');
}

function editTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  document.getElementById('modal-transaction-title').textContent = 'Edit Transaction';
  document.getElementById('tx-edit-id').value = tx.id;
  document.getElementById('tx-description').value = tx.description;
  document.getElementById('tx-amount').value = tx.amount;
  document.getElementById('tx-date').value = tx.date;
  document.getElementById('tx-category').value = tx.category;
  document.getElementById('tx-account').value = tx.account;
  document.getElementById('tx-note').value = tx.note || '';
  openModal('modal-transaction');
}

function saveTransaction() {
  const desc = document.getElementById('tx-description').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const date = document.getElementById('tx-date').value;
  const category = document.getElementById('tx-category').value;
  const account = document.getElementById('tx-account').value;
  const note = document.getElementById('tx-note').value.trim();
  const editId = document.getElementById('tx-edit-id').value;

  if (!desc || isNaN(amount) || amount <= 0 || !date) return alert('Please fill in all required fields.');

  if (editId) {
    const idx = state.transactions.findIndex(t => t.id === editId);
    if (idx >= 0) state.transactions[idx] = { ...state.transactions[idx], description: desc, amount, date, category, account, note };
  } else {
    state.transactions.push({ id: uid(), description: desc, amount, date, category, account, note });
  }

  saveState();
  closeModal('modal-transaction');
  renderSection(currentSection());
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  renderSection(currentSection());
}

// Bill
function openAddBill(type) {
  document.getElementById('modal-bill-title').textContent = type === 'essential' ? 'Add Essential Bill' : 'Add Subscription';
  document.getElementById('bill-edit-id').value = '';
  document.getElementById('bill-type').value = type;
  document.getElementById('bill-name').value = '';
  document.getElementById('bill-amount').value = '';
  document.getElementById('bill-due-day').value = '';
  document.getElementById('bill-category').value = type === 'essential' ? 'Housing' : 'Streaming';
  openModal('modal-bill');
}

function editBill(id) {
  const b = state.bills.find(b => b.id === id);
  if (!b) return;
  document.getElementById('modal-bill-title').textContent = b.type === 'essential' ? 'Edit Essential Bill' : 'Edit Subscription';
  document.getElementById('bill-edit-id').value = b.id;
  document.getElementById('bill-type').value = b.type;
  document.getElementById('bill-name').value = b.name;
  document.getElementById('bill-amount').value = b.amount;
  document.getElementById('bill-due-day').value = b.dueDay || '';
  document.getElementById('bill-category').value = b.category;
  openModal('modal-bill');
}

function saveBill() {
  const name = document.getElementById('bill-name').value.trim();
  const amount = parseFloat(document.getElementById('bill-amount').value);
  const dueDay = parseInt(document.getElementById('bill-due-day').value) || null;
  const category = document.getElementById('bill-category').value;
  const type = document.getElementById('bill-type').value;
  const editId = document.getElementById('bill-edit-id').value;

  if (!name || isNaN(amount) || amount <= 0) return alert('Please enter a valid name and amount.');

  if (editId) {
    const idx = state.bills.findIndex(b => b.id === editId);
    if (idx >= 0) state.bills[idx] = { ...state.bills[idx], name, amount, dueDay, category, type };
  } else {
    state.bills.push({ id: uid(), name, amount, dueDay, category, type });
  }

  saveState();
  closeModal('modal-bill');
  renderSection(currentSection());
}

function deleteBill(id) {
  if (!confirm('Delete this bill?')) return;
  state.bills = state.bills.filter(b => b.id !== id);
  saveState();
  renderSection(currentSection());
}

// Account
function openEditAccount(type) {
  document.getElementById('modal-account-title').textContent = `Edit ${type === 'checking' ? 'Checking' : 'Savings'} Account`;
  document.getElementById('account-type').value = type;
  document.getElementById('account-balance').value = state.accounts[type];
  openModal('modal-account');
}

function saveAccount() {
  const type = document.getElementById('account-type').value;
  const balance = parseFloat(document.getElementById('account-balance').value);
  if (isNaN(balance) || balance < 0) return alert('Please enter a valid balance.');
  state.accounts[type] = balance;
  saveState();
  closeModal('modal-account');
  renderSection(currentSection());
}

// Income
function openEditIncome() {
  document.getElementById('income-amount').value = state.income.monthly;
  document.getElementById('income-frequency').value = state.income.frequency;
  openModal('modal-income');
}

function saveIncome() {
  const amount = parseFloat(document.getElementById('income-amount').value);
  const frequency = document.getElementById('income-frequency').value;
  if (isNaN(amount) || amount < 0) return alert('Please enter a valid income amount.');
  state.income = { monthly: amount, frequency };
  saveState();
  closeModal('modal-income');
  renderSection(currentSection());
}

// Additional Income
function openAddAdditionalIncome() {
  document.getElementById('addl-income-edit-id').value = '';
  document.getElementById('addl-income-name').value = '';
  document.getElementById('addl-income-amount').value = '';
  document.getElementById('addl-income-frequency').value = 'monthly';
  document.getElementById('modal-addl-income-title').textContent = 'Add Additional Income';
  openModal('modal-addl-income');
}

function editAdditionalIncome(id) {
  const item = (state.additionalIncome || []).find(i => i.id === id);
  if (!item) return;
  document.getElementById('addl-income-edit-id').value = item.id;
  document.getElementById('addl-income-name').value = item.name;
  document.getElementById('addl-income-amount').value = item.amount;
  document.getElementById('addl-income-frequency').value = item.frequency;
  document.getElementById('modal-addl-income-title').textContent = 'Edit Additional Income';
  openModal('modal-addl-income');
}

function saveAdditionalIncome() {
  const name = document.getElementById('addl-income-name').value.trim();
  const amount = parseFloat(document.getElementById('addl-income-amount').value);
  const frequency = document.getElementById('addl-income-frequency').value;
  const editId = document.getElementById('addl-income-edit-id').value;

  if (!name || isNaN(amount) || amount <= 0) return alert('Please enter a valid name and amount.');

  if (!state.additionalIncome) state.additionalIncome = [];

  if (editId) {
    const idx = state.additionalIncome.findIndex(i => i.id === editId);
    if (idx >= 0) state.additionalIncome[idx] = { ...state.additionalIncome[idx], name, amount, frequency };
  } else {
    state.additionalIncome.push({ id: uid(), name, amount, frequency });
  }

  saveState();
  closeModal('modal-addl-income');
  renderSection(currentSection());
}

function deleteAdditionalIncome(id) {
  if (!confirm('Remove this income source?')) return;
  state.additionalIncome = (state.additionalIncome || []).filter(i => i.id !== id);
  saveState();
  renderSection(currentSection());
}

// Goal
function openAddGoal() {
  document.getElementById('modal-goal-title').textContent = 'Add Savings Goal';
  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-saved').value = '';
  document.getElementById('goal-monthly-contrib').value = '';
  document.getElementById('goal-account').value = 'savings';
  document.getElementById('goal-date').value = '';
  openModal('modal-goal');
}

function editGoal(id) {
  const g = state.goals.find(g => g.id === id);
  if (!g) return;
  document.getElementById('modal-goal-title').textContent = 'Edit Savings Goal';
  document.getElementById('goal-edit-id').value = g.id;
  document.getElementById('goal-name').value = g.name;
  document.getElementById('goal-target').value = g.target;
  document.getElementById('goal-saved').value = g.saved;
  document.getElementById('goal-monthly-contrib').value = g.monthlyContrib || '';
  document.getElementById('goal-account').value = g.account;
  document.getElementById('goal-date').value = g.targetDate || '';
  openModal('modal-goal');
}

function saveGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  const saved = parseFloat(document.getElementById('goal-saved').value) || 0;
  const monthlyContrib = parseFloat(document.getElementById('goal-monthly-contrib').value) || 0;
  const account = document.getElementById('goal-account').value;
  const targetDate = document.getElementById('goal-date').value || null;
  const editId = document.getElementById('goal-edit-id').value;

  if (!name || isNaN(target) || target <= 0) return alert('Please enter a goal name and target amount.');

  if (editId) {
    const idx = state.goals.findIndex(g => g.id === editId);
    if (idx >= 0) state.goals[idx] = { ...state.goals[idx], name, target, saved, monthlyContrib, account, targetDate };
  } else {
    state.goals.push({ id: uid(), name, target, saved, monthlyContrib, account, targetDate });
  }

  saveState();
  closeModal('modal-goal');
  renderSection(currentSection());
}

function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return;
  state.goals = state.goals.filter(g => g.id !== id);
  saveState();
  renderSection(currentSection());
}

/* ─── Unexpected Expenses ───────────────────────────────────────── */
let unexpectedChart;

function renderUnexpected() {
  const items = state.unexpected || [];
  const key = currentMonthKey();
  const thisMonth = items.filter(u => u.date.startsWith(key));
  const monthTotal = thisMonth.reduce((s, u) => s + u.amount, 0);
  const allTotal = items.reduce((s, u) => s + u.amount, 0);

  document.getElementById('unexp-month-total').textContent = fmt(monthTotal);
  document.getElementById('unexp-all-total').textContent = fmt(allTotal);
  document.getElementById('unexp-count').textContent = items.length;

  const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
  const list = document.getElementById('unexpected-list');
  list.innerHTML = sorted.length ? sorted.map(u => {
    const icons = { 'Medical': '🏥', 'Veterinary': '🐾', 'Car Repair': '🔧', 'Home Repair': '🏠', 'Emergency Travel': '✈️', 'Appliance': '🔌', 'Legal': '⚖️', 'Other Unexpected': '⚠️' };
    const icon = icons[u.category] || '⚠️';
    return `<div class="tx-item">
      <div class="tx-item-left">
        <div class="tx-icon cat-other" style="background:rgba(239,68,68,0.15);color:#ef4444">${icon}</div>
        <div class="tx-info">
          <div class="tx-name">${u.description}</div>
          <div class="tx-meta">${u.category} &middot; ${formatDate(u.date)} &middot; ${u.account}${u.note ? ' &middot; ' + u.note : ''}</div>
        </div>
      </div>
      <div class="tx-item-right">
        <span class="tx-amount amount-red">-${fmt(u.amount)}</span>
        <div class="tx-actions">
          <button onclick="editUnexpected('${u.id}')" title="Edit">&#9998;</button>
          <button onclick="deleteUnexpected('${u.id}')" title="Delete">&#10005;</button>
        </div>
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">No unexpected expenses recorded yet.</div>';

  // Chart by category
  const ctx = document.getElementById('unexpected-chart').getContext('2d');
  if (unexpectedChart) unexpectedChart.destroy();
  const catTotals = {};
  items.forEach(u => { catTotals[u.category] = (catTotals[u.category] || 0) + u.amount; });
  const cats = Object.keys(catTotals);
  if (cats.length === 0) return;
  const colors = ['#ef4444','#f59e0b','#a855f7','#4f8ef7','#2ec47a','#06b6d4','#f97316','#84cc16'];
  unexpectedChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: cats,
      datasets: [{ label: 'Total Spent', data: cats.map(c => catTotals[c]), backgroundColor: colors.slice(0, cats.length), borderRadius: 4 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a8099', font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#7a8099', font: { size: 10 }, callback: v => '$' + v.toLocaleString() }, grid: { color: '#2a2f3d' } }
      }
    }
  });
}

/* ─── Credit Cards ──────────────────────────────────────────────── */
function renderCreditCards() {
  const cards = state.creditCards || [];
  const key = currentMonthKey();

  // Summary row
  const totalDebt = cards.reduce((s, c) => s + (c.balance || 0), 0);
  const totalLimit = cards.reduce((s, c) => s + (c.limit || 0), 0);
  const totalPayments = cards.reduce((s, c) => s + (c.paymentAllocation || c.minPayment || 0), 0);
  const util = totalLimit > 0 ? ((totalDebt / totalLimit) * 100).toFixed(1) : 0;

  document.getElementById('cc-total-balance').textContent = fmt(totalDebt);
  document.getElementById('cc-total-limit').textContent = fmt(totalLimit);
  document.getElementById('cc-total-payments').textContent = fmt(totalPayments);
  const utilEl = document.getElementById('cc-overall-util');
  utilEl.textContent = util + '%';
  utilEl.className = 'cc-summary-value' + (util > 30 ? ' amount-orange' : util > 75 ? ' amount-red' : ' amount-green');

  // Cards list
  const listEl = document.getElementById('cc-cards-list');
  if (cards.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No credit cards added. Click "+ Add Card" to get started.</div>';
  } else {
    listEl.innerHTML = cards.map(c => {
      const network = c.network || 'Other';
      const netClass = 'cc-network-' + network.toLowerCase().replace(' ', '');
      const issuerDisplay = c.issuer === 'Other' ? (c.customIssuer || 'Other') : (c.issuer || '—');
      const cardUtil = c.limit > 0 ? ((c.balance / c.limit) * 100).toFixed(1) : 0;
      const utilColor = cardUtil > 75 ? '#ef4444' : cardUtil > 30 ? '#f59e0b' : '#2ec47a';
      return `<div class="cc-card">
        <div class="cc-card-header">
          <div class="cc-card-title">
            <span class="cc-network-badge ${netClass}">${network}</span>
            <div>
              <div class="cc-card-name">${c.name}</div>
              <div class="cc-card-issuer">${issuerDisplay}</div>
            </div>
          </div>
          <div class="cc-card-actions">
            <button class="btn-tx" onclick="viewCCTransactions('${c.id}')" title="View Transactions">&#128203; Transactions</button>
            <button onclick="editCreditCard('${c.id}')" title="Edit">&#9998; Edit</button>
            <button onclick="deleteCreditCard('${c.id}')" title="Delete">&#10005; Delete</button>
          </div>
        </div>
        <div class="cc-card-body">
          <div class="cc-card-field">
            <span class="cc-card-field-label">Current Balance</span>
            <span class="cc-card-field-value amount-red">${fmt(c.balance || 0)}</span>
          </div>
          <div class="cc-card-field">
            <span class="cc-card-field-label">Credit Limit</span>
            <span class="cc-card-field-value">${fmt(c.limit || 0)}</span>
          </div>
          <div class="cc-card-field">
            <span class="cc-card-field-label">APR</span>
            <span class="cc-card-field-value">${c.apr || 0}%</span>
          </div>
          <div class="cc-card-field">
            <span class="cc-card-field-label">Min Payment</span>
            <span class="cc-card-field-value amount-orange">${fmt(c.minPayment || 0)}</span>
          </div>
          <div class="cc-card-field">
            <span class="cc-card-field-label">Statement Balance</span>
            <span class="cc-card-field-value">${fmt(c.statementBalance || 0)}</span>
          </div>
          <div class="cc-card-field">
            <span class="cc-card-field-label">Available Credit</span>
            <span class="cc-card-field-value amount-green">${fmt(Math.max(0, (c.limit || 0) - (c.balance || 0)))}</span>
          </div>
          <div class="cc-card-field">
            <span class="cc-card-field-label">Payment Allocation</span>
            <span class="cc-card-field-value" style="color:#4f8ef7">${fmt(c.paymentAllocation || 0)}</span>
          </div>
          <div class="cc-card-field">
            <span class="cc-card-field-label">Due Day</span>
            <span class="cc-card-field-value">${c.dueDay ? 'Day ' + c.dueDay : '—'}</span>
          </div>
        </div>
        <div class="cc-util-bar-wrap">
          <div class="cc-util-bar-label">
            <span>Utilization</span>
            <span style="color:${utilColor}">${cardUtil}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${Math.min(100, cardUtil)}%;background:${utilColor}"></div>
          </div>
        </div>
        <div class="cc-card-footer">
          <div class="cc-payoff-info">
            <span>Est. Payoff: <strong style="color:#a855f7">${calcPayoff(c)}</strong></span>
            <span style="color:#7a8099;font-size:11px">at current payment</span>
          </div>
          <button class="btn btn-sm btn-primary" onclick="openLogPayment('${c.id}')">+ Log Payment</button>
        </div>
      </div>`;
    }).join('');
  }

  // Payoff Summary
  const payoffEl = document.getElementById('cc-payoff-summary');
  if (cards.length > 0) {
    const totalMonthly = cards.reduce((s, c) => s + Math.max(c.paymentAllocation || 0, c.minPayment || 0), 0);
    const totalBal = cards.reduce((s, c) => s + (c.balance || 0), 0);
    const overallMonths = totalMonthly > 0 ? Math.ceil(totalBal / totalMonthly) : null;
    payoffEl.innerHTML = `
      <div class="cc-payoff-row">
        <div class="cc-payoff-stat"><span>Total Balance</span><strong class="amount-red">${fmt(totalBal)}</strong></div>
        <div class="cc-payoff-stat"><span>Monthly Payments</span><strong class="amount-orange">${fmt(totalMonthly)}</strong></div>
        <div class="cc-payoff-stat"><span>Overall Payoff Est.</span><strong style="color:#a855f7">${overallMonths ? formatMonths(overallMonths) : '—'}</strong></div>
      </div>
      <div style="margin-top:12px">
        ${cards.map(c => {
          const mo = calcPayoffMonths(c);
          const pct = c.limit > 0 ? Math.min(100, (c.balance / c.limit) * 100) : 0;
          const color = pct > 75 ? '#ef4444' : pct > 30 ? '#f59e0b' : '#2ec47a';
          return `<div class="cc-payoff-card-row">
            <span>${c.name}</span>
            <span>${fmt(c.balance || 0)} balance</span>
            <span style="color:#a855f7">${mo ? formatMonths(mo) : '—'}</span>
          </div>`;
        }).join('')}
      </div>`;
  } else {
    payoffEl.innerHTML = '<div class="empty-state">No credit cards to project.</div>';
  }

  // Payment History
  const histEl = document.getElementById('cc-payment-history-list');
  const payments = [...(state.ccPaymentHistory || [])].sort((a,b) => new Date(b.date) - new Date(a.date));
  histEl.innerHTML = payments.length ? payments.slice(0, 20).map(p => {
    const card = cards.find(c => c.id === p.cardId);
    return `<div class="tx-item">
      <div class="tx-item-left">
        <div class="tx-icon" style="background:rgba(46,196,122,0.15);color:#2ec47a">💳</div>
        <div class="tx-info">
          <div class="tx-name">Payment — ${card ? card.name : 'Unknown Card'}</div>
          <div class="tx-meta">${formatDate(p.date)} &middot; ${p.note || 'Manual payment'}</div>
        </div>
      </div>
      <div class="tx-item-right">
        <span class="tx-amount amount-green">-${fmt(p.amount)}</span>
        <div class="tx-actions">
          <button onclick="deleteCCPayment('${p.id}')" title="Delete">&#10005;</button>
        </div>
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">No payments logged yet.</div>';

  // Monthly CC Spending
  const creditTxs = state.transactions.filter(t => t.account === 'credit' && t.date.startsWith(key));
  const spendEl = document.getElementById('cc-spending-list');
  spendEl.innerHTML = creditTxs.length
    ? creditTxs.sort((a, b) => new Date(b.date) - new Date(a.date)).map(tx => txHTML(tx)).join('')
    : '<div class="empty-state">No credit card transactions this month.</div>';

  // Payment Tracker
  const trackerEl = document.getElementById('cc-payment-tracker-list');
  if (cards.length === 0) {
    trackerEl.innerHTML = '<div class="empty-state">No credit cards to track.</div>';
  } else {
    trackerEl.innerHTML = cards.map(c => {
      const stmtBal = c.statementBalance || 0;
      const alloc = c.paymentAllocation || 0;
      const minPay = c.minPayment || 0;
      const meetsMin = alloc >= minPay;
      const statusClass = meetsMin ? 'cc-payment-ok' : 'cc-payment-warn';
      const statusText = alloc === 0 ? 'No allocation set' : meetsMin ? 'Paying min or more' : 'Below minimum!';
      return `<div class="cc-payment-tracker-row">
        <div class="cc-payment-tracker-name">${c.name}</div>
        <div class="cc-payment-tracker-stats">
          <div class="cc-payment-tracker-stat">
            <span>Statement Bal</span>
            <strong>${fmt(stmtBal)}</strong>
          </div>
          <div class="cc-payment-tracker-stat">
            <span>Want to Pay</span>
            <strong style="color:#4f8ef7">${fmt(alloc)}</strong>
          </div>
          <div class="cc-payment-tracker-stat">
            <span>Minimum Due</span>
            <strong class="amount-orange">${fmt(minPay)}</strong>
          </div>
          <div class="cc-payment-tracker-stat">
            <span>Status</span>
            <strong class="${statusClass}">${statusText}</strong>
          </div>
        </div>
      </div>`;
    }).join('');
  }
}

// Payoff helpers
function calcPayoffMonths(card) {
  const bal = card.balance || 0;
  const payment = Math.max(card.paymentAllocation || 0, card.minPayment || 0);
  if (bal <= 0 || payment <= 0) return null;
  const monthlyRate = (card.apr || 0) / 100 / 12;
  if (monthlyRate === 0) return Math.ceil(bal / payment);
  // Amortization formula
  if (payment <= bal * monthlyRate) return null; // payment doesn't cover interest
  return Math.ceil(Math.log(payment / (payment - bal * monthlyRate)) / Math.log(1 + monthlyRate));
}

function calcPayoff(card) {
  const mo = calcPayoffMonths(card);
  return mo ? formatMonths(mo) : (card.balance <= 0 ? '🎉 Paid off!' : '—');
}

function formatMonths(mo) {
  if (mo <= 0) return '—';
  const y = Math.floor(mo / 12);
  const m = mo % 12;
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y}y ${m}m`;
}

// Log a payment against a card's balance
function openLogPayment(cardId) {
  const card = (state.creditCards || []).find(c => c.id === cardId);
  if (!card) return;
  document.getElementById('log-payment-card-id').value = cardId;
  document.getElementById('log-payment-card-name').textContent = card.name;
  document.getElementById('log-payment-amount').value = card.paymentAllocation || card.minPayment || '';
  document.getElementById('log-payment-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('log-payment-note').value = '';
  openModal('modal-log-payment');
}

function saveLogPayment() {
  const cardId = document.getElementById('log-payment-card-id').value;
  const amount = parseFloat(document.getElementById('log-payment-amount').value);
  const date = document.getElementById('log-payment-date').value;
  const note = document.getElementById('log-payment-note').value.trim();
  if (isNaN(amount) || amount <= 0) return alert('Please enter a valid payment amount.');

  // Deduct from card balance
  const idx = (state.creditCards || []).findIndex(c => c.id === cardId);
  if (idx >= 0) state.creditCards[idx].balance = Math.max(0, (state.creditCards[idx].balance || 0) - amount);

  // Log payment history
  if (!state.ccPaymentHistory) state.ccPaymentHistory = [];
  state.ccPaymentHistory.push({ id: uid(), cardId, month: date.slice(0,7), amount, date, note });

  saveState();
  closeModal('modal-log-payment');
  renderCreditCards();
}

function deleteCCPayment(id) {
  if (!confirm('Remove this payment record? Note: this does NOT add the amount back to your card balance.')) return;
  state.ccPaymentHistory = (state.ccPaymentHistory || []).filter(p => p.id !== id);
  saveState();
  renderCreditCards();
}

function viewCCTransactions(cardId) {
  navigate('spending');
  renderSpending();
}

function toggleCustomIssuer() {
  const issuer = document.getElementById('cc-issuer').value;
  document.getElementById('cc-custom-issuer-group').style.display = issuer === 'Other' ? 'block' : 'none';
}

// Credit Card modals
function openAddCreditCard() {
  document.getElementById('modal-cc-title').textContent = 'Add Credit Card';
  document.getElementById('cc-edit-id').value = '';
  document.getElementById('cc-network').value = 'Visa';
  document.getElementById('cc-issuer').value = 'USAA';
  document.getElementById('cc-custom-issuer-group').style.display = 'none';
  document.getElementById('cc-custom-issuer').value = '';
  document.getElementById('cc-name').value = '';
  document.getElementById('cc-balance').value = '';
  document.getElementById('cc-limit').value = '';
  document.getElementById('cc-statement-balance').value = '';
  document.getElementById('cc-payment-allocation').value = '';
  document.getElementById('cc-apr').value = '';
  document.getElementById('cc-min-payment').value = '';
  document.getElementById('cc-due-day').value = '';
  openModal('modal-credit-card');
}

function editCreditCard(id) {
  const c = (state.creditCards || []).find(c => c.id === id);
  if (!c) return;
  document.getElementById('modal-cc-title').textContent = 'Edit Credit Card';
  document.getElementById('cc-edit-id').value = c.id;
  document.getElementById('cc-network').value = c.network || 'Visa';
  document.getElementById('cc-issuer').value = c.issuer || 'USAA';
  toggleCustomIssuer();
  document.getElementById('cc-custom-issuer').value = c.customIssuer || '';
  document.getElementById('cc-name').value = c.name;
  document.getElementById('cc-balance').value = c.balance;
  document.getElementById('cc-limit').value = c.limit;
  document.getElementById('cc-statement-balance').value = c.statementBalance || '';
  document.getElementById('cc-payment-allocation').value = c.paymentAllocation || '';
  document.getElementById('cc-apr').value = c.apr;
  document.getElementById('cc-min-payment').value = c.minPayment;
  document.getElementById('cc-due-day').value = c.dueDay || '';
  openModal('modal-credit-card');
}

function saveCreditCard() {
  const name = document.getElementById('cc-name').value.trim();
  const network = document.getElementById('cc-network').value;
  const issuer = document.getElementById('cc-issuer').value;
  const customIssuer = document.getElementById('cc-custom-issuer').value.trim();
  const balance = parseFloat(document.getElementById('cc-balance').value) || 0;
  const limit = parseFloat(document.getElementById('cc-limit').value) || 0;
  const statementBalance = parseFloat(document.getElementById('cc-statement-balance').value) || 0;
  const paymentAllocation = parseFloat(document.getElementById('cc-payment-allocation').value) || 0;
  const apr = parseFloat(document.getElementById('cc-apr').value) || 0;
  const minPayment = parseFloat(document.getElementById('cc-min-payment').value) || 0;
  const dueDay = parseInt(document.getElementById('cc-due-day').value) || null;
  const editId = document.getElementById('cc-edit-id').value;

  if (!name) return alert('Please enter a card name.');
  if (!state.creditCards) state.creditCards = [];

  const cardData = { name, network, issuer, customIssuer, balance, limit, statementBalance, paymentAllocation, apr, minPayment, dueDay };

  if (editId) {
    const idx = state.creditCards.findIndex(c => c.id === editId);
    if (idx >= 0) state.creditCards[idx] = { ...state.creditCards[idx], ...cardData };
  } else {
    state.creditCards.push({ id: uid(), ...cardData });
  }
  saveState();
  closeModal('modal-credit-card');
  renderSection(currentSection());
}

function deleteCreditCard(id) {
  if (!confirm('Remove this credit card?')) return;
  state.creditCards = (state.creditCards || []).filter(c => c.id !== id);
  saveState();
  renderSection(currentSection());
}

function saveSavingsAlloc() {
  const val = parseFloat(document.getElementById('savings-alloc-input').value) || 0;
  state.savingsAllocation = val;
  saveState();
  renderSection(currentSection());
}

// Unexpected expense modals
function openAddUnexpected() {
  document.getElementById('modal-unexp-title').textContent = 'Add Unexpected Expense';
  document.getElementById('unexp-edit-id').value = '';
  document.getElementById('unexp-description').value = '';
  document.getElementById('unexp-amount').value = '';
  document.getElementById('unexp-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('unexp-category').value = 'Medical';
  document.getElementById('unexp-account').value = 'checking';
  document.getElementById('unexp-note').value = '';
  openModal('modal-unexpected');
}

function editUnexpected(id) {
  const u = (state.unexpected || []).find(u => u.id === id);
  if (!u) return;
  document.getElementById('modal-unexp-title').textContent = 'Edit Unexpected Expense';
  document.getElementById('unexp-edit-id').value = u.id;
  document.getElementById('unexp-description').value = u.description;
  document.getElementById('unexp-amount').value = u.amount;
  document.getElementById('unexp-date').value = u.date;
  document.getElementById('unexp-category').value = u.category;
  document.getElementById('unexp-account').value = u.account;
  document.getElementById('unexp-note').value = u.note || '';
  openModal('modal-unexpected');
}

function saveUnexpected() {
  const description = document.getElementById('unexp-description').value.trim();
  const amount = parseFloat(document.getElementById('unexp-amount').value);
  const date = document.getElementById('unexp-date').value;
  const category = document.getElementById('unexp-category').value;
  const account = document.getElementById('unexp-account').value;
  const note = document.getElementById('unexp-note').value.trim();
  const editId = document.getElementById('unexp-edit-id').value;

  if (!description || isNaN(amount) || amount <= 0 || !date) return alert('Please fill in all required fields.');
  if (!state.unexpected) state.unexpected = [];

  if (editId) {
    const idx = state.unexpected.findIndex(u => u.id === editId);
    if (idx >= 0) state.unexpected[idx] = { ...state.unexpected[idx], description, amount, date, category, account, note };
  } else {
    state.unexpected.push({ id: uid(), description, amount, date, category, account, note });
  }
  saveState();
  closeModal('modal-unexpected');
  renderSection(currentSection());
}

function deleteUnexpected(id) {
  if (!confirm('Delete this expense?')) return;
  state.unexpected = (state.unexpected || []).filter(u => u.id !== id);
  saveState();
  renderSection(currentSection());
}

/* ─── Utilities ─────────────────────────────────────────────────── */
function currentSection() {
  const active = document.querySelector('.section.active');
  return active ? active.id.replace('section-', '') : 'dashboard';
}

/* ─── Init ──────────────────────────────────────────────────────── */
function init() {
  loadState();

  // Month label
  const now = new Date();
  document.getElementById('current-month-label').textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // Populate month filter
  const filterMonth = document.getElementById('filter-month');
  const months = new Set(state.transactions.map(t => t.date.slice(0, 7)));
  months.add(currentMonthKey());
  [...months].sort().reverse().forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = monthLabel(m);
    if (m === currentMonthKey()) opt.selected = true;
    filterMonth.appendChild(opt);
  });

  // Populate category filter
  const filterCat = document.getElementById('filter-category');
  const cats = [...new Set(state.transactions.map(t => t.category))];
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    filterCat.appendChild(opt);
  });

  // Nav listeners
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.section);
    });
  });

  // "View all" links
  document.querySelectorAll('[data-section]').forEach(el => {
    if (el.classList.contains('link')) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.section);
      });
    }
  });

  // Add transaction buttons
  document.getElementById('add-transaction-btn').addEventListener('click', openAddTransaction);
  document.getElementById('add-transaction-btn2').addEventListener('click', openAddTransaction);

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      document.getElementById('modal-overlay').classList.add('hidden');
    }
  });

  // Prevent overlay from stealing focus/clicks from modal inputs
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('mousedown', e => e.stopPropagation());
    modal.addEventListener('click', e => e.stopPropagation());
  });

  checkNewMonth();
  renderDashboard();
}

// Auto-save on every state mutation is already handled by saveState().
// This catches any edge cases where the window closes mid-operation.
window.addEventListener('beforeunload', () => saveState());

document.addEventListener('DOMContentLoaded', init);
