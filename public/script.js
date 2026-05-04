/* ── ALCIE Script ── */
const BASE = 'http://localhost:3000';
let sessionId = null;
let donutChart = null;

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initDonut();
  initAdditionalCharts();
  initButtons();
  loadMetrics();
  animateCounters();
  setInterval(loadMetrics, 10000);
});

/* ── Animations ── */
function animateCounters() {
  const counters = document.querySelectorAll('.kpi-counter');
  counters.forEach(counter => {
    const target = +counter.getAttribute('data-val');
    const duration = 2000;
    const startTime = performance.now();
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 5); // ease out quint
      const val = Math.floor(easeProgress * target);
      counter.textContent = '$' + val.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        counter.textContent = '$' + target.toLocaleString();
      }
    };
    requestAnimationFrame(update);
  });
}

/* ── Navigation ── */
function initNav() {
  document.querySelectorAll('[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      if (item.classList.contains('nav-item')) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
      }
      
      const page = item.getAttribute('data-page');
      if(page) {
        document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
        const activeSection = document.getElementById('page-' + page);
        if(activeSection) {
            activeSection.classList.remove('hidden');
            activeSection.classList.add('fade-in');
        } else {
            // Defaulting to dashboard content if no wrapper is found
            document.querySelectorAll('.page-section').forEach(s => s.classList.remove('hidden'));
            document.querySelectorAll('.page-section[id^="page-"]').forEach(s => s.classList.add('hidden'));
        }
      }
    });
  });
  document.querySelectorAll('.tnav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.tnav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });
  document.getElementById('tglWeekly').addEventListener('click', () => {
    document.getElementById('tglWeekly').classList.add('active');
    document.getElementById('tglMonthly').classList.remove('active');
  });
  document.getElementById('tglMonthly').addEventListener('click', () => {
    document.getElementById('tglMonthly').classList.add('active');
    document.getElementById('tglWeekly').classList.remove('active');
  });
}

/* ── Buttons ── */
function initButtons() {
  document.getElementById('btnSeed').addEventListener('click', seedDemo);
  document.getElementById('btnNewSession').addEventListener('click', () => createSession());
  document.getElementById('btnAnalyze').addEventListener('click', runAnalyze);
  document.getElementById('btnUpgrade').addEventListener('click', () => {
    showToast('⚡ AI Auto-Optimization started. Routing traffic...', 'accent');
    setTimeout(() => {
      document.getElementById('alertMsg').innerHTML = '✅ Optimization complete. Projected savings: <b style="color:var(--green)">$1,240/mo</b>';
      document.getElementById('btnUpgrade').textContent = 'OPTIMIZED';
      document.getElementById('btnUpgrade').disabled = true;
      document.getElementById('btnUpgrade').style.background = 'var(--green)';
      animateCounters(); // Re-trigger to show update
    }, 2000);
  });
  
  const btnAutoSwitch = document.getElementById('btnAutoSwitch');
  if (btnAutoSwitch) {
    btnAutoSwitch.addEventListener('click', () => {
      showToast('🔄 Applying recommendation: Switching to Gemini Flash.', 'accent');
      btnAutoSwitch.textContent = 'Applied ✅';
      btnAutoSwitch.style.color = 'var(--green)';
      btnAutoSwitch.style.pointerEvents = 'none';
    });
  }
  
  // App View Transitions
  document.getElementById('btnLogin')?.addEventListener('click', () => {
    document.getElementById('app-login').classList.remove('active');
    document.getElementById('app-onboarding').classList.add('active');
  });

  document.getElementById('btnObNext1')?.addEventListener('click', () => {
    document.getElementById('obStep1').classList.remove('active');
    document.getElementById('obStep2').classList.add('active');
  });

  document.getElementById('btnObNext2')?.addEventListener('click', () => {
    document.getElementById('obStep2').classList.remove('active');
    document.getElementById('obStep3').classList.add('active');
  });

  document.getElementById('btnObFinish')?.addEventListener('click', () => {
    document.getElementById('app-onboarding').classList.remove('active');
    document.getElementById('app-dashboard').classList.add('active');
    setTimeout(() => {
      showToast('✅ Your AI CFO is ready', 'green');
      animateCounters();
    }, 500);
  });

  // Provider Connect Buttons
  document.querySelectorAll('.connect-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.api-card');
      const status = card.querySelector('.connect-status');
      e.target.textContent = '⏳ Connecting...';
      e.target.disabled = true;
      setTimeout(() => {
        e.target.textContent = 'Connected';
        status.textContent = 'Connected';
        status.style.color = 'var(--green)';
        showToast('🔗 Provider Connected Successfully!', 'green');
      }, 1000);
    });
  });

  // Preference Cards
  document.querySelectorAll('.preference-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.preference-card').forEach(c => {
        c.style.opacity = '0.7';
        c.style.borderColor = 'var(--border)';
        c.style.background = 'var(--surface2)';
        c.querySelector('.pref-title').style.color = 'var(--text)';
      });
      card.style.opacity = '1';
      card.style.borderColor = 'var(--accent)';
      card.style.background = 'rgba(123, 97, 255, 0.05)';
      card.querySelector('.pref-title').style.color = 'var(--accent)';
    });
  });

  // Slider updates
  document.getElementById('obBudgetSlider')?.addEventListener('input', (e) => {
    document.getElementById('obBudgetDisplay').textContent = '$' + parseInt(e.target.value).toLocaleString();
  });

  // Simulate Opt
  document.getElementById('btnSimulateOpt')?.addEventListener('click', () => {
    const btn = document.getElementById('btnSimulateOpt');
    btn.textContent = '⏳ Simulating...';
    btn.disabled = true;
    setTimeout(() => {
      document.getElementById('optSimResult').innerHTML = `
        <div style="font-size: 24px; font-weight: 800; color: var(--green); margin-bottom: 8px;">You save $1,240/month</div>
        <div style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">By routing 30% of traffic to Gemini Flash</div>
        <button class="btn-accent ripple">Apply Rules to Production</button>
      `;
      btn.textContent = 'Run Optimization Simulation ⚡';
      btn.disabled = false;
    }, 1500);
  });

  // Notifications Toggle
  document.querySelector('.icon-btn[title="Notifications"]')?.addEventListener('click', () => {
    document.getElementById('notifPanel').classList.toggle('active');
  });
  document.getElementById('btnExport').addEventListener('click', exportCSV);
  document.getElementById('fabAnalyze').addEventListener('click', () => {
    document.getElementById('analyzerModal').classList.remove('hidden');
  });
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('analyzerModal').classList.add('hidden');
  });
  document.getElementById('modalBackdrop').addEventListener('click', () => {
    document.getElementById('analyzerModal').classList.add('hidden');
  });
  document.getElementById('queryInput').addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') runAnalyze();
  });

  // AI Avatar Generator
  document.getElementById('btnGenAvatar')?.addEventListener('click', () => {
    const btn = document.getElementById('btnGenAvatar');
    btn.textContent = 'Generating...';
    btn.disabled = true;
    setTimeout(() => {
      const seed = Math.random().toString(36).substring(7);
      const url = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${seed}&backgroundColor=7c3aed,00d2ff`;
      const sidebarAvatar = document.getElementById('sidebarAvatar');
      const profileAvatar = document.getElementById('profileAvatar');
      const topbarAvatar = document.getElementById('topbarAvatar');
      if(sidebarAvatar) sidebarAvatar.src = url;
      if(profileAvatar) profileAvatar.src = url;
      if(topbarAvatar) topbarAvatar.src = url;
      showToast('🤖 AI Avatar Generated!', 'accent');
      btn.textContent = 'Generate AI Avatar';
      btn.disabled = false;
    }, 600);
  });

  // Project Rename
  document.getElementById('btnRenameProject')?.addEventListener('click', () => {
    const newName = document.getElementById('inputProjectName')?.value.trim();
    if (newName) {
      document.querySelector('.brand-name').textContent = newName;
      document.title = `${newName} - Enterprise LLM Optimization`;
      showToast('✏️ Workspace renamed successfully!', 'green');
    }
  });
}

/* ── Donut Chart ── */
function initDonut(data) {
  const ctx = document.getElementById('chartDonut');
  if (!ctx) return;
  if (donutChart) donutChart.destroy();
  const vals = data
    ? [data.modelDistribution.gpt4 || 0, data.modelDistribution.claude || 0, data.modelDistribution.gemini || 0, data.modelDistribution.gpt35 || 0]
    : [45, 30, 25, 0];
  const total = vals.reduce((a, b) => a + b, 0);
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['GPT-4', 'Claude', 'Gemini', 'GPT-3.5'],
      datasets: [{
        data: vals,
        backgroundColor: ['#6382ff', '#06d6a0', '#a855f7', '#fbbf24'],
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: false,
      cutout: '72%',
      plugins: {
        legend: { display: false }, tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${total ? Math.round(ctx.parsed / total * 100) : 0}%`
          }
        }
      }
    }
  });
  // Update legend
  const legend = document.getElementById('modelLegend');
  const names = ['GPT-4', 'Claude', 'Gemini', 'GPT-3.5'];
  const colors = ['#6382ff', '#06d6a0', '#a855f7', '#fbbf24'];
  legend.innerHTML = names.map((n, i) => {
    const pct = total ? Math.round(vals[i] / total * 100) : 0;
    if (!pct) return '';
    return `<div class="legend-item"><span class="dot" style="background:${colors[i]}"></span><span class="legend-name">${n}</span><span class="legend-pct">${pct}%</span></div>`;
  }).join('');
}

/* ── Session ── */
async function createSession(budget) {
  const b = budget || parseFloat(document.getElementById('budgetInput')?.value || 10);
  try {
    const res = await fetch(`${BASE}/api/session/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget: b })
    });
    const d = await res.json();
    sessionId = d.sessionId;
    showToast('✅ Session created', 'green');
  } catch { showToast('⚠️ Start the server first: npm start', 'warn'); }
}

/* ── Demo Seed ── */
async function seedDemo() {
  try {
    await fetch(`${BASE}/api/demo/seed`, { method: 'POST' });
    if (!sessionId) await createSession(5);
    await loadMetrics();
    showToast('🌱 Demo data loaded!', 'green');
  } catch { showToast('⚠️ Server not running', 'warn'); }
}

/* ── Analyze ── */
async function runAnalyze() {
  const query = document.getElementById('queryInput').value.trim();
  if (!query) { showToast('Please enter a query', 'warn'); return; }
  if (!sessionId) await createSession();

  const btn = document.getElementById('btnAnalyze');
  btn.textContent = '⏳ Analyzing…'; btn.disabled = true;

  try {
    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, sessionId, model: document.getElementById('modelSelect').value || undefined })
    });
    const d = await res.json();
    renderAnalyzeResult(d);
    await loadMetrics();
    showToast('✅ Analysis complete!', 'green');
  } catch { showToast('❌ Server error', 'error'); }
  finally { btn.textContent = '⚡ Analyze & Optimize'; btn.disabled = false; }
}

function renderAnalyzeResult(d) {
  const el = document.getElementById('analyzeResult');
  el.classList.remove('hidden');
  const c = d.cost || {}; const t = d.tokens || {}; const r = d.routing || {};
  el.innerHTML = `
    <div class="ar-row"><span class="ar-key">Model Selected</span><span class="ar-val accent">${r.model || '—'}</span></div>
    <div class="ar-row"><span class="ar-key">Intent</span><span class="ar-val">${d.intent?.type || '—'} (${((d.intent?.complexity || 0) * 100).toFixed(0)}%)</span></div>
    <div class="ar-row"><span class="ar-key">Tokens Used</span><span class="ar-val">${(t.total || 0).toLocaleString()}</span></div>
    <div class="ar-row"><span class="ar-key">Actual Cost</span><span class="ar-val">$${(c.actual || 0).toFixed(5)}</span></div>
    <div class="ar-row"><span class="ar-key">Cost Saved</span><span class="ar-val green">$${(c.saved || 0).toFixed(5)}</span></div>
    <div class="ar-row"><span class="ar-key">Prompt Tokens Saved</span><span class="ar-val green">${d.prompt?.tokensSaved || 0}</span></div>
    <div class="ar-row"><span class="ar-key">Reason</span><span class="ar-val">${r.reason || '—'}</span></div>
  `;
}

/* ── Load Metrics ── */
async function loadMetrics() {
  try {
    const res = await fetch(`${BASE}/api/metrics`);
    const d = await res.json();
    updateDonut(d);
    updateAlertBanner(d);
    updateExpenditure(d);
    updateTable(d);
  } catch { /* offline */ }
}

function updateDonut(d) {
  const total = d.totalQueries || 0;
  const tokensSaved = d.totalTokensSaved || 0;
  const display = total > 0 ? formatNum(tokensSaved + 4200) : '4.2M';
  document.getElementById('donutVal').textContent = display;
  initDonut(d);
}

function updateAlertBanner(d) {
  const daily = d.dailyCosts || [];
  const totalSpent = daily.reduce((s, x) => s + x.cost, 0);
  const budget = 20;
  const pct = Math.min(100, (totalSpent / budget) * 100);
  if (pct > 10) {
    document.getElementById('alertMsg').textContent =
      `Monthly consumption has reached ${pct.toFixed(0)}% ($${totalSpent.toFixed(2)} / $${budget.toFixed(2)}). ` +
      (pct > 80 ? 'Automated throttling scheduled at 90%.' : 'System monitoring active.');
  }
}

function updateExpenditure(d) {
  const log = d.queryLog || [];
  if (!log.length) return;
  const projects = [
    { name: 'Enterprise AI Chat', cost: 8450.20, color: '#6382ff', max: 10000 },
    { name: 'Legal Review Agent', cost: 4120.00, color: '#06d6a0', max: 15000 },
    { name: 'Content Engine V3', cost: 2940.15, color: '#a855f7', max: 20000 },
    { name: 'Internal Search', cost: 1080.00, color: '#fbbf24', max: 5000 },
  ];
  const maxCost = Math.max(...projects.map(p => p.cost));
  document.getElementById('expenditureList').innerHTML = projects.map(p => `
    <div class="exp-row">
      <div class="exp-name">${p.name}</div>
      <div class="exp-right">
        <div class="exp-bar-track"><div class="exp-bar" style="width:${(p.cost / maxCost * 100).toFixed(0)}%;background:${p.color}"></div></div>
        <div class="exp-amount">$${p.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>
  `).join('');
}

function updateTable(d) {
  const log = d.queryLog || [];
  if (!log.length) return;
  const modelClass = m => m.includes('gpt-4') ? 'gpt4' : m.includes('gpt-3') ? 'gpt35' : m.includes('claude') ? 'claude' : m.includes('llama') ? 'llama' : 'gemini';
  const statusClass = () => { const r = Math.random(); return r > 0.6 ? 'active' : r > 0.3 ? 'inprogress' : 'paused'; };
  const statusLabel = c => c === 'active' ? '● Active' : c === 'inprogress' ? '● In Progress' : '● Paused';
  const rows = log.slice(0, 4);
  document.getElementById('usageTableBody').innerHTML = rows.map(q => {
    const sc = statusClass();
    return `
    <tr>
      <td><a class="key-id">sk-${q.model?.slice(0, 4) || 'opti'}-${q.id?.slice(0, 4) || '0000'}</a></td>
      <td><span class="model-badge ${modelClass(q.model || '')}">${(q.model || 'unknown').toUpperCase()}</span></td>
      <td class="mono">${((q.inputTokens || 0) + (q.outputTokens || 0)).toLocaleString()}</td>
      <td class="mono">$${(q.cost || 0).toFixed(4)}</td>
      <td><span class="status-badge ${sc}">${statusLabel(sc)}</span></td>
      <td class="mono muted">${timeAgo(q.ts)}</td>
      <td><button class="row-action">↗</button></td>
    </tr>`;
  }).join('');
  document.getElementById('tableInfo').textContent = `Showing 1–${rows.length} of ${log.length} logs`;
}

/* ── Helpers ── */
function timeAgo(ts) {
  if (!ts) return '—';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function exportCSV() {
  const rows = [['KEY ID', 'MODEL', 'TOKENS', 'COST', 'STATUS']];
  document.querySelectorAll('#usageTableBody tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length) rows.push([cells[0].textContent.trim(), cells[1].textContent.trim(), cells[2].textContent.trim(), cells[3].textContent.trim(), cells[4].textContent.trim()]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = 'alcie_key_usage.csv';
  a.click();
  showToast('📥 CSV exported', 'green');
}

function showToast(msg, type = 'green') {
  const colors = { green: '#06d6a0', warn: '#fbbf24', error: '#ff4d6d', accent: '#6382ff' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;
    background:#13161e;border:1px solid ${colors[type]};color:${colors[type]};
    padding:11px 22px;border-radius:10px;font-size:13px;font-weight:600;
    box-shadow:0 6px 28px rgba(0,0,0,0.5);font-family:'Inter',sans-serif;
    animation:slideIn .3s ease;white-space:nowrap;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function initAdditionalCharts() {
  Chart.defaults.color = '#8b95b1';
  Chart.defaults.font.family = "'Inter', sans-serif";
  
  // Token Usage Chart (Bar)
  const ctxToken = document.getElementById('tokenUsageChart');
  if (ctxToken) {
    new Chart(ctxToken, {
      type: 'bar',
      data: {
        labels: ['1st', '5th', '10th', '15th', '20th', '25th', '30th'],
        datasets: [{
          label: 'GPT-4o',
          data: [120, 150, 110, 180, 140, 200, 160],
          backgroundColor: '#3B82F6'
        }, {
          label: 'Claude 3 Opus',
          data: [60, 80, 50, 90, 70, 110, 80],
          backgroundColor: '#EF4444'
        }, {
          label: 'Gemini 1.5 Flash',
          data: [200, 250, 220, 300, 280, 350, 310],
          backgroundColor: '#22C55E'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // Cost Analytics Chart (Line)
  const ctxCost = document.getElementById('costAnalyticsChart');
  if (ctxCost) {
    new Chart(ctxCost, {
      type: 'line',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{
          label: 'Projected Cost',
          data: [2100, 4300, 6500, 8700],
          borderColor: 'rgba(255,255,255,0.3)',
          borderDash: [5, 5],
          fill: false,
          tension: 0.4
        }, {
          label: 'Actual Cost',
          data: [2100, 4100, 5900, 7800],
          borderColor: '#7C3AED',
          backgroundColor: 'rgba(124, 58, 237, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // Model Efficiency Chart (Scatter)
  const ctxEff = document.getElementById('efficiencyChart');
  if (ctxEff) {
    new Chart(ctxEff, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Gemini Flash',
          data: [{x: 0.35, y: 88}, {x: 0.38, y: 89}],
          backgroundColor: '#22C55E'
        }, {
          label: 'GPT-4o',
          data: [{x: 5.0, y: 95}, {x: 5.2, y: 96}],
          backgroundColor: '#3B82F6'
        }, {
          label: 'Claude Opus',
          data: [{x: 15.0, y: 98}],
          backgroundColor: '#EF4444'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: function(ctx) { return `${ctx.dataset.label}: Cost $${ctx.raw.x}/1M, Score ${ctx.raw.y}`; }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Cost ($/1M Tokens)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { title: { display: true, text: 'Eval Score (0-100)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
}

// Theme Toggling Logic
const themes = ['dark', 'light', 'flower'];
let currentThemeIdx = 0;
document.getElementById('btnTheme')?.addEventListener('click', () => {
  currentThemeIdx = (currentThemeIdx + 1) % themes.length;
  const t = themes[currentThemeIdx];
  if (t === 'dark') {
    document.documentElement.removeAttribute('data-theme');
    showToast('🌙 Switched to Dark Theme', 'accent');
  } else {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'light') showToast('☀️ Switched to Light Theme', 'accent');
    if (t === 'flower') showToast('🌸 Switched to Sakura Theme', 'accent');
  }
});
