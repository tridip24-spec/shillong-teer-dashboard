// State Management
const state = {
  data: null,
  history: [],
  autoRefreshEnabled: true,
  refreshCountdown: 60,
  refreshTimerId: null,
  refreshCountdownId: null,
  timerInterval: null,
};

// API Utility
async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
}

// Update UI Status
function updateStatus(message, type = 'normal') {
  const indicator = document.getElementById('statusIndicator');
  if (indicator) {
    indicator.textContent = message;
    indicator.className = `status-indicator status-${type}`;
  }
}

// Extract house and ending from number
function extractDigits(num) {
  if (!num || num === '--' || num === 'XX' || num === 'OFF') return { house: '-', ending: '-' };
  const str = num.toString().padStart(2, '0');
  return {
    house: str[0],
    ending: str[1]
  };
}

// Render Chips
function renderChips(containerId, items, mapper) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="chip">No data</div>';
    return;
  }

  items.forEach(item => {
    const mapped = mapper(item);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = mapped;
    container.appendChild(chip);
  });
}

// Render Daily Results
function renderDailyResults(rows) {
  const filter = document.getElementById('historyFilter')?.value.toLowerCase() || '';
  const container = document.getElementById('dailyResultsContainer');
  
  if (!container) return;
  
  container.innerHTML = '';

  const filtered = (rows || []).filter(row => {
    const haystack = `${row.date || ''} ${row.firstRound || ''} ${row.secondRound || ''}`.toLowerCase();
    return haystack.includes(filter);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No results found</div>';
    return;
  }

  filtered.forEach(row => {
    const item = document.createElement('div');
    item.className = 'result-item';
    
    const frDigits = extractDigits(row.firstRound);
    const srDigits = extractDigits(row.secondRound);
    
    item.innerHTML = `
      <div class="result-date">${row.date || '--'}</div>
      <div class="result-number">${row.firstRound || '--'}</div>
      <div class="result-number">${row.secondRound || '--'}</div>
      <div class="result-info">
        <span>H: ${frDigits.house}/${srDigits.house}</span> | 
        <span>E: ${frDigits.ending}/${srDigits.ending}</span>
      </div>
    `;
    container.appendChild(item);
  });

  const count = document.getElementById('historyCount');
  if (count) {
    count.textContent = `Showing ${filtered.length} of ${rows.length} results`;
  }
}

// Render Predictions
function renderPredictions(predictions) {
  const container = document.getElementById('predictionsGrid');
  if (!container) return;

  container.innerHTML = '';
  if (!predictions?.possibleNumbers || predictions.possibleNumbers.length === 0) {
    container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No predictions available</div>';
    return;
  }

  predictions.possibleNumbers.forEach((pred, idx) => {
    const card = document.createElement('div');
    card.className = `prediction-card confidence-${pred.confidence || 'watch'}`;
    
    const maxScore = 20;
    const fillPercent = Math.min(100, (pred.score / maxScore) * 100);
    
    card.innerHTML = `
      <div class="prediction-number">${pred.value}</div>
      <div class="prediction-score">
        <div class="prediction-fill" style="width: ${fillPercent}%"></div>
      </div>
      <div class="prediction-label">${pred.confidence || 'watch'} • ${pred.reason || 'Analysis'}</div>
    `;
    container.appendChild(card);
  });
}

// Render Rising Items
function renderRisingItems(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="chip">No data</div>';
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'rising-item';
    div.innerHTML = `
      <span class="rising-item-label">${item.value ? (isNaN(item.value) ? item.value : `${item.value}`).toString() : 'Unknown'}</span>
      <span class="rising-item-value">+${item.shift || 0}</span>
    `;
    container.appendChild(div);
  });
}

// Render Analytics
function renderAnalytics(analytics) {
  if (!analytics) return;

  // Top Houses and Endings
  renderChips('topHouses', analytics.topHouses, item => `House ${item.value} (${item.score})`);
  renderChips('topEndings', analytics.topEndings, item => `Ending ${item.value} (${item.score})`);

  // Rising data
  renderRisingItems('risingHouses', analytics.risingHouses);
  renderRisingItems('risingEndings', analytics.risingEndings);

  // Strongest Direct
  renderChips('strongDirectNumbers', analytics.strongestDirect, item => `${item.value} (${item.count}x)`);
}

// Render Dashboard - MAIN FUNCTION
function renderDashboard(payload) {
  if (!payload) return;

  console.log('=== RENDERING DASHBOARD ===');
  console.log('Full payload:', payload);

  // Live Results - REAL TIME DATA
  const liveData = payload.live || {};
  
  console.log('Live data object:', liveData);
  console.log('FR:', liveData.firstRound, 'SR:', liveData.secondRound);
  
  // Update live results display
  const dateEl = document.getElementById('liveDate');
  const frEl = document.getElementById('firstRound');
  const srEl = document.getElementById('secondRound');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  
  if (dateEl) dateEl.textContent = liveData.date || '--';
  if (frEl) frEl.textContent = liveData.firstRound || '--';
  if (srEl) srEl.textContent = liveData.secondRound || '--';

  // Extract and display house/ending
  const frDigits = extractDigits(liveData.firstRound);
  const srDigits = extractDigits(liveData.secondRound);
  
  console.log('FR digits:', frDigits, 'SR digits:', srDigits);
  
  const frHouseEl = document.getElementById('frHouse');
  const frEndingEl = document.getElementById('frEnding');
  const srHouseEl = document.getElementById('srHouse');
  const srEndingEl = document.getElementById('srEnding');
  
  if (frHouseEl) frHouseEl.textContent = frDigits.house;
  if (frEndingEl) frEndingEl.textContent = frDigits.ending;
  if (srHouseEl) srHouseEl.textContent = srDigits.house;
  if (srEndingEl) srEndingEl.textContent = srDigits.ending;

  // Update time
  if (lastUpdatedEl) {
    const time = new Date(payload.meta?.fetchedAt || new Date());
    lastUpdatedEl.textContent = `Updated ${time.toLocaleTimeString()}`;
  }

  // Common Numbers
  renderChips('publishedCommonNumbers', liveData.commonNumbers, item => item);

  // Daily Results
  state.history = payload.history || [];
  console.log('History rows:', state.history.length);
  renderDailyResults(state.history);

  // Predictions
  console.log('Predictions:', payload.predictions);
  renderPredictions(payload.predictions);

  // Analytics
  console.log('Analytics:', payload.analytics);
  renderAnalytics(payload.analytics);

  // Possible Numbers
  renderChips('possibleNumbers', payload.predictions?.possibleNumbers, item => `${item.value} (${item.confidence})`);

  state.data = payload;
  updateStatus('Connected', 'connected');
  
  console.log('=== RENDER COMPLETE ===');
}

// Timer Update
function updateTimers() {
  const now = new Date();
  
  const updateTimer = (elementId, hour, minute) => {
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    if (now > target) {
      target.setDate(target.getDate() + 1);
    }
    
    const diff = target - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  };
  
  updateTimer('frTimer', 16, 0);  // 4:00 PM
  updateTimer('srTimer', 16, 45); // 4:45 PM
}

// Load Dashboard
async function loadDashboard(refresh = false) {
  try {
    updateStatus('Fetching data...', 'loading');
    const url = refresh ? '/api/dashboard?days=365&refresh=1' : '/api/dashboard?days=365';
    console.log('📡 Fetching from:', url);
    const payload = await fetchJson(url);
    console.log('📥 Received payload:', payload);
    renderDashboard(payload);
    updateStatus('Connected', 'connected');
  } catch (err) {
    console.error('❌ Load dashboard error:', err);
    updateStatus('Error loading data', 'error');
  }
}

// Auto Refresh
function startAutoRefresh() {
  if (state.refreshTimerId) clearInterval(state.refreshTimerId);

  if (!state.autoRefreshEnabled) return;

  // Refresh every 60 seconds
  state.refreshTimerId = setInterval(() => {
    console.log('🔄 Auto-refreshing...');
    loadDashboard(true);
  }, 60000);
}

// History Filter
function setupHistoryFilter() {
  const filter = document.getElementById('historyFilter');
  if (filter) {
    filter.addEventListener('input', () => {
      renderDailyResults(state.history);
    });
  }
}

// Insights Form
async function handleInsightsSubmit(event) {
  event.preventDefault();
  try {
    const fr = document.getElementById('seedFr')?.value.trim() || '';
    const sr = document.getElementById('seedSr')?.value.trim() || '';
    
    const params = new URLSearchParams();
    if (fr) params.append('fr', fr);
    if (sr) params.append('sr', sr);
    
    const url = `/api/insights${params.toString() ? '?' + params.toString() : ''}`;
    const data = await fetchJson(url);
    
    if (data.possibleNumbers) {
      renderChips('possibleNumbers', data.possibleNumbers, item => `${item.value} (${item.confidence})`);
    }
    
    const note = document.getElementById('insightNote');
    if (note) {
      note.textContent = data.note || 'Analysis complete';
    }
  } catch (err) {
    const note = document.getElementById('insightNote');
    if (note) {
      note.textContent = `Error: ${err.message}`;
    }
  }
}

// Register Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing dashboard...');
  
  // Set copyright year
  const yearEl = document.getElementById('copyrightYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('🔄 Refresh clicked');
      loadDashboard(true);
    });
  }

  // Auto refresh toggle
  const autoToggle = document.getElementById('autoRefreshToggle');
  if (autoToggle) {
    autoToggle.addEventListener('change', (e) => {
      state.autoRefreshEnabled = e.target.checked;
      console.log('Auto refresh toggle:', state.autoRefreshEnabled);
      startAutoRefresh();
    });
  }

  // Insights form
  const form = document.getElementById('insightsForm');
  if (form) {
    form.addEventListener('submit', handleInsightsSubmit);
  }

  // Setup filters
  setupHistoryFilter();

  // Load initial data
  console.log('📊 Loading initial dashboard data...');
  loadDashboard();

  // Start timers
  updateTimers();
  state.timerInterval = setInterval(updateTimers, 1000);

  // Start auto refresh
  startAutoRefresh();

  // Register service worker
  registerServiceWorker();
});

// Cleanup on unload
window.addEventListener('unload', () => {
  if (state.refreshTimerId) clearInterval(state.refreshTimerId);
  if (state.refreshCountdownId) clearInterval(state.refreshCountdownId);
  if (state.timerInterval) clearInterval(state.timerInterval);
});
