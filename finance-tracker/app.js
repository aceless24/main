/* ─── State ─────────────────────────────────────────────────────── */
let state = {
  accounts: { checking: 0, savings: 0 },
  income: { monthly: 0, frequency: 'monthly' },
  bills: [],        // { id, name, amount, type:'essential'|'subscription', category, dueDay }
  transactions: [], // { id, description, amount, date, category, account, note }
  goals: []         // { id, name, target, saved, targetDate, account }
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

function totalBills() {
  return state.bills.reduce((s, b) => s + b.amount, 0);
}

function totalEssential() {
  return state.bills.filter(b => b.type === 'essential').reduce((s, b) => s + b.amount, 0);
}

function totalSubscriptions() {
  return state.bills.filter(b => b.type === 'subscription').reduce((s, b) => s + b.amount, 0);
}

function discretionaryBudget() {
  return state.income.monthly - totalBills();
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
    spending: 'Spending',
    budget: 'Budget',
    outlook: 'Outlook',
    goals: 'Savings Goals'
  }[section] || section;

  renderSection(section);
}

function renderSection(section) {
  if (section === 'dashboard') renderDashboard();
  if (section === 'accounts') renderAccounts();
  if (section === 'bills') renderBills();
  if (section === 'spending') renderSpending();
  if (section === 'budget') renderBudget();
  if (section === 'outlook') renderOutlook();
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
      <div class="income-item-label">Monthly Take-Home</div>
      <div class="income-item-value">${fmt(state.income.monthly)}</div>
    </div>
    <div class="income-item">
      <div class="income-item-label">Per Paycheck (${state.income.frequency})</div>
      <div class="income-item-value">${fmt(wkly)}</div>
    </div>
    <div class="income-item">
      <div class="income-item-label">After Bills</div>
      <div class="income-item-value">${fmt(Math.max(0, discretionaryBudget()))}</div>
    </div>
  `;
}

/* ─── Bills ─────────────────────────────────────────────────────── */
function renderBills() {
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

  document.getElementById('essential-total-footer').textContent = fmt(totalEssential());
  document.getElementById('subscription-total-footer').textContent = fmt(totalSubscriptions());
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
  const inc = state.income.monthly;
  const bills = totalBills();
  const disc = discretionaryBudget();
  const wkly = weeklyBudget();
  const spent = spentThisMonth();

  document.getElementById('budget-income').textContent = fmt(inc);
  document.getElementById('budget-bills').textContent = fmt(bills);
  document.getElementById('budget-discretionary').textContent = fmt(Math.max(0, disc));
  document.getElementById('budget-weekly').textContent = fmt(Math.max(0, wkly));

  // breakdown
  const breakdown = document.getElementById('budget-breakdown');
  const billsPct = inc > 0 ? (bills / inc) * 100 : 0;
  const spendingPct = inc > 0 ? (spent / inc) * 100 : 0;
  const savingsPct = 100 - billsPct - spendingPct;

  breakdown.innerHTML = `
    <div class="budget-item">
      <div class="budget-item-header"><span>Bills &amp; Subscriptions</span><span>${fmt(bills)} (${billsPct.toFixed(0)}%)</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(100,billsPct)}%;background:#ef4444"></div></div>
    </div>
    <div class="budget-item">
      <div class="budget-item-header"><span>Discretionary Spending (This Month)</span><span>${fmt(spent)} (${spendingPct.toFixed(0)}%)</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(100,spendingPct)}%;background:#f59e0b"></div></div>
    </div>
    <div class="budget-item">
      <div class="budget-item-header"><span>Remaining</span><span>${fmt(Math.max(0,disc - spent))} (${Math.max(0, savingsPct).toFixed(0)}%)</span></div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(100,Math.max(0,savingsPct))}%;background:#2ec47a"></div></div>
    </div>
  `;

  // per-category spending vs estimated budget
  const catCtx = document.getElementById('budget-vs-spend-chart').getContext('2d');
  if (budgetVsSpendChart) budgetVsSpendChart.destroy();

  const key = currentMonthKey();
  const txs = getTransactionsForMonth(key);
  const catTotals = {};
  txs.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const cats = Object.keys(catTotals);
  budgetVsSpendChart = new Chart(catCtx, {
    type: 'bar',
    data: {
      labels: cats,
      datasets: [{
        label: 'Spent This Month',
        data: cats.map(c => catTotals[c]),
        backgroundColor: '#4f8ef7',
        borderRadius: 4
      }]
    },
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

  const perCatBudget = disc > 0 ? disc / cats.length : 0;
  progressList.innerHTML = cats.map(cat => {
    const s = catTotals[cat];
    const pct = perCatBudget > 0 ? Math.min(100, (s / perCatBudget) * 100) : 0;
    const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#2ec47a';
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span>${CATEGORY_ICONS[cat] || ''} ${cat}</span>
          <span>${fmt(s)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
    `;
  }).join('');
}

/* ─── Outlook ───────────────────────────────────────────────────── */
let outlookChart;

function renderOutlook() {
  const months = parseInt(document.getElementById('outlook-months').value);
  const savingsRate = parseFloat(document.getElementById('outlook-savings-rate').value);

  const inc = state.income.monthly;
  const bills = totalBills();
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

    const savingsContrib = inc * savingsRate;
    const netChange = inc - bills - avgSpending - savingsContrib;
    checkingBalance += netChange;
    savingsBalance += savingsContrib;

    rows.push({ label, income: inc, bills, spending: avgSpending, savings: savingsContrib, checkingBalance, savingsBalance, total: checkingBalance + savingsBalance });
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

  list.innerHTML = state.goals.map(g => {
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const remaining = g.target - g.saved;
    const targetDate = new Date(g.targetDate + 'T00:00:00');
    const now = new Date();
    const monthsLeft = Math.max(1, (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()));
    const perMonth = remaining > 0 ? remaining / monthsLeft : 0;

    return `
      <div class="goal-item">
        <div class="goal-header">
          <div>
            <div class="goal-name">${g.name}</div>
            <div class="goal-meta">${g.account} account &middot; Target: ${formatDate(g.targetDate + '')}</div>
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
          <span>${fmt(g.saved)} saved of ${fmt(g.target)}</span>
          <span>${pct.toFixed(0)}% complete</span>
          <span>${fmt(remaining)} to go</span>
        </div>
      </div>
    `;
  }).join('');

  // Plan section
  const planEl = document.getElementById('goals-plan');
  planEl.innerHTML = state.goals.map(g => {
    const remaining = Math.max(0, g.target - g.saved);
    const targetDate = new Date(g.targetDate + 'T00:00:00');
    const now = new Date();
    const monthsLeft = Math.max(1, (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()));
    const perMonth = remaining / monthsLeft;

    return `
      <div class="goal-plan-row">
        <div>
          <strong>${g.name}</strong>
          <div style="font-size:11px;color:#7a8099;margin-top:2px">${monthsLeft} months remaining &middot; ${fmt(remaining)} left</div>
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

// Goal
function openAddGoal() {
  document.getElementById('modal-goal-title').textContent = 'Add Savings Goal';
  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-saved').value = '';
  document.getElementById('goal-account').value = 'savings';
  // default to 6 months out
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  document.getElementById('goal-date').value = d.toISOString().slice(0, 10);
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
  document.getElementById('goal-account').value = g.account;
  document.getElementById('goal-date').value = g.targetDate;
  openModal('modal-goal');
}

function saveGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  const saved = parseFloat(document.getElementById('goal-saved').value) || 0;
  const account = document.getElementById('goal-account').value;
  const targetDate = document.getElementById('goal-date').value;
  const editId = document.getElementById('goal-edit-id').value;

  if (!name || isNaN(target) || target <= 0 || !targetDate) return alert('Please fill in all required fields.');

  if (editId) {
    const idx = state.goals.findIndex(g => g.id === editId);
    if (idx >= 0) state.goals[idx] = { ...state.goals[idx], name, target, saved, account, targetDate };
  } else {
    state.goals.push({ id: uid(), name, target, saved, account, targetDate });
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

  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
