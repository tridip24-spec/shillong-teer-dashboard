// --- Enhanced frontend script (v2)
// Adds: scheduled predictions rendering (16:15, 17:20)
//       dream-number suggestions
//       cache-busted asset references in index.html

// State Management
const state = {
  data: null,
  history: [],
  autoRefreshEnabled: true,
  refreshTimerId: null,
  timerInterval: null,
};

// Simple dream mapping (starter). Expand as needed.
const DREAM_MAP = {
  snake: ['12','34','56'],
  river: ['07','70','28'],
  house: ['11','22','33'],
  baby: ['01','10','19'],
  fish: ['02','20','39'],
  bird: ['03','30','48'],
  tree: ['04','40','57'],
  fire: ['05','50','68']
};

// API Utility with retry
async function fetchJsonWithRetry(url, retries = 2, backoff = 700) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, backoff * (i + 1)));
    }
  }
}

// UI helpers
function updateStatus(message, type = 'normal') {
  const indicator = document.getElementById('statusIndicator');
  if (indicator) { indicator.textContent = message; indicator.className = `status-indicator status-${type}`; }
}

function extractDigits(num) {
  if (!num || num === 'XX' || num === '--') return { house: '-', ending: '-' };
  const s = String(num).padStart(2, '0');
  return { house: s[0], ending: s[1] };
}

function renderChips(containerId, items, mapper) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  if (!items || items.length === 0) { c.innerHTML = '<div class="chip">No data</div>'; return; }
  items.forEach(it => { const el = document.createElement('div'); el.className = 'chip'; el.textContent = mapper ? mapper(it) : it; c.appendChild(el); });
}

function renderDailyResults(rows) {
  const filter = document.getElementById('historyFilter')?.value.toLowerCase() || '';
  const container = document.getElementById('dailyResultsContainer');
  if (!container) return; container.innerHTML = '';
  const filtered = (rows||[]).filter(r => (`${r.date} ${r.firstRound} ${r.secondRound}`).toLowerCase().includes(filter));
  if (filtered.length === 0) { container.innerHTML = '<div style="padding:2rem;color:var(--muted)">No results found</div>'; return; }
  filtered.forEach(row => {
    const item = document.createElement('div'); item.className = 'result-item';
    const fr = extractDigits(row.firstRound); const sr = extractDigits(row.secondRound);
    item.innerHTML = `<div class="result-date">${row.date}</div><div class="result-number">${row.firstRound}</div><div class="result-number">${row.secondRound}</div><div class="result-info">H: ${fr.house}/${sr.house} | E: ${fr.ending}/${sr.ending}</div>`;
    container.appendChild(item);
  });
  const count = document.getElementById('historyCount'); if (count) count.textContent = `Showing ${filtered.length} of ${rows.length} results`;
}

function renderPredictions(pred) {
  const container = document.getElementById('predictionsGrid'); if (!container) return; container.innerHTML = '';
  if (!pred?.possibleNumbers) { container.innerHTML = '<div style="padding:2rem;color:var(--muted)">No predictions</div>'; return; }
  pred.possibleNumbers.forEach(p => {
    const el = document.createElement('div'); el.className = 'prediction-card';
    const pct = Math.min(100, (p.score/420)*100);
    el.innerHTML = `<div class="prediction-number">${p.value}</div><div class="prediction-score"><div class="prediction-fill" style="width:${pct}%"></div></div><div class="prediction-label">${p.confidence||'watch'} • ${p.reason||''}</div>`;
    container.appendChild(el);
  });
}

function renderAnalytics(a) {
  if (!a) return;
  renderChips('topHouses', a.topHouses||[], it => `House ${it.value} (${it.score})`);
  renderChips('topEndings', a.topEndings||[], it => `Ending ${it.value} (${it.score})`);
  // rising lists
  const rh = document.getElementById('risingHouses'); if (rh) { rh.innerHTML=''; (a.risingHouses||[]).forEach(item => { const div=document.createElement('div'); div.className='rising-item'; div.innerHTML = `<span>${item.value}</span><span>+${item.shift}</span>`; rh.appendChild(div); }); }
  const re = document.getElementById('risingEndings'); if (re) { re.innerHTML=''; (a.risingEndings||[]).forEach(item => { const div=document.createElement('div'); div.className='rising-item'; div.innerHTML = `<span>${item.value}</span><span>+${item.shift}</span>`; re.appendChild(div); }); }
  renderChips('strongDirectNumbers', a.strongestDirect||[], it => `${it.value} (${it.count}x)`);
}

// New: scheduled predictions rendering for two scheduled times
function renderScheduledPredictions(payload) {
  const times = [ {label:'16:15', id:'16:15'}, {label:'17:20', id:'17:20'} ];
  const container = document.getElementById('scheduledPredictions'); if (!container) return; container.innerHTML = '';
  const candidates = (payload?.predictions?.possibleNumbers || []).slice(0,6).map(p => p.value);
  times.forEach(t => {
    const card = document.createElement('div'); card.className = 'scheduled-card';
    // If official published in live.recentRows or live matches time, prefer official numbers (we don't have time-of-day mapping from API). We'll display predictions and mark as predictions until official is present.
    const title = `<div class="time">Scheduled draw ${t.label}</div>`;
    // pick top 3 candidates rotated by time label index
    const startIndex = t.label === '16:15' ? 0 : 3;
    const nums = candidates.slice(startIndex, startIndex+3).join('  ');
    const note = `<div class="note">Predicted numbers (informational). Will be replaced by official results when available.</div>`;
    card.innerHTML = `${title}<div class="numbers">${nums || '--'}</div>${note}`;
    container.appendChild(card);
  });
}

function renderDashboard(payload) {
  if (!payload) return; console.log('renderDashboard', payload);
  const live = payload.live || {};
  document.getElementById('liveDate').textContent = live.date || '--';
  document.getElementById('firstRound').textContent = live.firstRound || '--';
  document.getElementById('secondRound').textContent = live.secondRound || '--';
  const fr = extractDigits(live.firstRound); const sr = extractDigits(live.secondRound);
  document.getElementById('frHouse').textContent = fr.house; document.getElementById('frEnding').textContent = fr.ending;
  document.getElementById('srHouse').textContent = sr.house; document.getElementById('srEnding').textContent = sr.ending;
  const lu = document.getElementById('lastUpdated'); if (lu) { const t = new Date(payload.meta?.fetchedAt||new Date()); lu.textContent = `Updated ${t.toLocaleTimeString()}`; }
  renderChips('publishedCommonNumbers', live.commonNumbers || [], it => it.value || it);
  state.history = payload.history || [];
  renderDailyResults(state.history);
  renderPredictions(payload.predictions);
  renderAnalytics(payload.analytics);
  renderChips('possibleNumbers', payload.predictions?.possibleNumbers || [], it => `${it.value} (${it.confidence})`);
  renderScheduledPredictions(payload);
  state.data = payload;
  updateStatus('Connected', 'connected');
}

// Timers
function updateTimers() {
  const now = new Date();
  function update(id, h, m) {
    const el = document.getElementById(id); if (!el) return; const t = new Date(); t.setHours(h,m,0,0); if (now > t) t.setDate(t.getDate()+1);
    const diff = t - now; const H = Math.floor(diff/3600000); const M = Math.floor((diff%3600000)/60000); const S = Math.floor((diff%60000)/1000);
    el.textContent = `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}:${String(S).padStart(2,'0')}`;
  }
  update('frTimer',16,0); update('srTimer',16,45);
}

// Load with retry wrapper
let loadInProgress = false;
async function loadDashboard(refresh = false) {
  if (loadInProgress) { console.log('Load in progress, skipping'); return; }
  loadInProgress = true; updateStatus('Fetching...', 'loading');
  try {
    const url = refresh ? '/api/dashboard?days=365&refresh=1' : '/api/dashboard?days=365';
    const payload = await fetchJsonWithRetry(url, 2, 800);
    renderDashboard(payload);
  } catch (err) {
    console.error('loadDashboard failed', err); updateStatus('Error', 'error');
  } finally { loadInProgress = false; }
}

// Dream suggestion logic
function suggestDreamNumbers(text) {
  if (!text) return [];
  const low = text.toLowerCase();
  const tokens = low.split(/[^a-z0-9]+/).filter(Boolean);
  const suggestions = new Set();
  tokens.forEach(tok => { if (DREAM_MAP[tok]) DREAM_MAP[tok].forEach(n => suggestions.add(n)); });
  // if no suggestions, fallback to simple numerology: map chars to numbers
  if (suggestions.size === 0) {
    let sum = 0; for (let ch of low) sum += ch.charCodeAt(0); const n1 = String(sum % 100).padStart(2,'0'); const n2 = String((sum+7) % 100).padStart(2,'0'); suggestions.add(n1); suggestions.add(n2);
  }
  return Array.from(suggestions).slice(0,6);
}

// events
function setupHistoryFilter() { const f = document.getElementById('historyFilter'); if (f) f.addEventListener('input', () => renderDailyResults(state.history)); }

async function handleInsightsSubmit(e) { e.preventDefault(); const fr = document.getElementById('seedFr')?.value.trim(); const sr = document.getElementById('seedSr')?.value.trim(); const params = new URLSearchParams(); if(fr) params.append('fr',fr); if(sr) params.append('sr',sr); try { const data = await fetchJsonWithRetry(`/api/insights?${params.toString()}`,2,600); if (data.possibleNumbers) renderChips('possibleNumbers', data.possibleNumbers, it => `${it.value} (${it.confidence})`); const note = document.getElementById('insightNote'); if (note) note.textContent = data.note || 'Analysis complete'; } catch(err){ const note = document.getElementById('insightNote'); if (note) note.textContent = `Error: ${err.message}`; }
}

// dream form handler
function handleDreamSubmit(e) { e.preventDefault(); const v = document.getElementById('dreamInput')?.value || ''; const out = document.getElementById('dreamResults'); if (!out) return; const sug = suggestDreamNumbers(v); out.innerHTML = ''; if (sug.length===0) { out.textContent='No suggestions'; } else { sug.forEach(s => { const el = document.createElement('div'); el.className='dream-suggestion'; el.textContent = s; out.appendChild(el); }); } }

// auto-refresh
function startAutoRefresh() { if (state.refreshTimerId) clearInterval(state.refreshTimerId); if (!state.autoRefreshEnabled) return; state.refreshTimerId = setInterval(() => { loadDashboard(true); }, 5*60*1000); }

// Register SW
function registerServiceWorker() { if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(console.warn); } }

// Init
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('copyrightYear').textContent = new Date().getFullYear();
  const refreshBtn = document.getElementById('refreshBtn'); if (refreshBtn) refreshBtn.addEventListener('click', () => loadDashboard(true));
  const autoToggle = document.getElementById('autoRefreshToggle'); if (autoToggle) { autoToggle.addEventListener('change', (e) => { state.autoRefreshEnabled = e.target.checked; startAutoRefresh(); }); }
  const form = document.getElementById('insightsForm'); if (form) form.addEventListener('submit', handleInsightsSubmit);
  const dreamForm = document.getElementById('dreamForm'); if (dreamForm) dreamForm.addEventListener('submit', handleDreamSubmit);
  setupHistoryFilter(); updateTimers(); state.timerInterval = setInterval(updateTimers,1000);
  loadDashboard(); startAutoRefresh(); registerServiceWorker();
});
