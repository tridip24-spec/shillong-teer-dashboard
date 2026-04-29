const REFRESH_INTERVAL_SECONDS = 30;

const state = {
  history: [],
  autoRefreshEnabled: true,
  refreshCountdown: REFRESH_INTERVAL_SECONDS,
  refreshTimerId: null,
  refreshCountdownId: null,
  dreamNumbers: [],
};

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function createChip({ title, subtitle = "" }) {
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.innerHTML = `<strong>${title}</strong>${subtitle ? `<span>${subtitle}</span>` : ""}`;
  return chip;
}

function renderChipList(targetId, items, mapper) {
  const target = document.getElementById(targetId);
  target.innerHTML = "";

  if (!items?.length) {
    target.appendChild(createChip({ title: "--", subtitle: "No data" }));
    return;
  }

  items.forEach((item) => target.appendChild(createChip(mapper(item))));
}

function renderBarChart(targetId, rows) {
  const target = document.getElementById(targetId);
  target.innerHTML = "";
  const max = Math.max(...rows.map((row) => row.count), 1);

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "bar-item";
    item.innerHTML = `
      <strong>${row.value}</strong>
      <div class="bar-track"><div class="bar-fill" style="width:${(row.count / max) * 100}%"></div></div>
      <span>${row.count}</span>
    `;
    target.appendChild(item);
  });
}

function renderMonthlyTrend(months) {
  const target = document.getElementById("monthlyTrend");
  target.innerHTML = "";

  months.forEach((month) => {
    const item = document.createElement("div");
    item.className = "month-card";
    item.innerHTML = `
      <strong>${month.month}</strong>
      <span>House ${month.busiestHouse}</span>
      <span>Ending ${month.busiestEnding}</span>
    `;
    target.appendChild(item);
  });
}

function renderHistoryTable(rows) {
  const filter = document.getElementById("historyFilter").value.trim().toLowerCase();
  const body = document.getElementById("historyTableBody");
  body.innerHTML = "";

  const filtered = rows.filter((row) => {
    const haystack = `${row.date} ${row.firstRound} ${row.secondRound}`.toLowerCase();
    return haystack.includes(filter);
  });

  filtered.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.firstRound}</td>
      <td>${row.secondRound}</td>
      <td>${row.firstRound[0]} / ${row.secondRound[0]}</td>
      <td>${row.firstRound[1]} / ${row.secondRound[1]}</td>
    `;
    body.appendChild(tr);
  });

  document.getElementById("historyCount").textContent = `${filtered.length} rows shown`;
}

function renderDreamTable() {
  const filter = document.getElementById("dreamTableFilter").value.trim().toLowerCase();
  const body = document.getElementById("dreamTableBody");
  body.innerHTML = "";

  const filtered = state.dreamNumbers.filter((entry) => {
    const haystack = `${entry.symbol} ${entry.number} ${entry.category}`.toLowerCase();
    return haystack.includes(filter);
  });

  filtered.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${entry.symbol}</td>
      <td>${entry.number}</td>
      <td>${entry.category}</td>
    `;
    body.appendChild(tr);
  });

  document.getElementById("dreamTableCount").textContent = `${filtered.length} dream rows shown`;
}

function renderDreamSearch() {
  const filter = document.getElementById("dreamSearch").value.trim().toLowerCase();
  const matches = filter
    ? state.dreamNumbers.filter((entry) => entry.symbol.toLowerCase().includes(filter)).slice(0, 8)
    : state.dreamNumbers.slice(0, 8);

  renderChipList("dreamMatches", matches, (entry) => ({
    title: entry.symbol,
    subtitle: entry.category,
  }));

  renderChipList("dreamSuggestedNumbers", matches, (entry) => ({
    title: entry.number,
    subtitle: entry.symbol,
  }));
}

function renderInsights(insights) {
  const source = insights.generatedFrom
    ? `${insights.generatedFrom.date} | FR ${insights.generatedFrom.firstRound} | SR ${insights.generatedFrom.secondRound}`
    : "No seed available";

  document.getElementById("insightSeedLabel").textContent = `Analyzed from: ${source}`;
  document.getElementById("insightNote").textContent = insights.note;

  renderChipList("topHouses", insights.topHouses, (item) => ({
    title: `House ${item.value}`,
    subtitle: `Score ${item.score}`,
  }));
  renderChipList("topEndings", insights.topEndings, (item) => ({
    title: `Ending ${item.value}`,
    subtitle: `Score ${item.score}`,
  }));
  renderChipList("topDirect", insights.topDirect, (item) => ({
    title: item.value,
    subtitle: `Score ${item.score}`,
  }));
  renderChipList("possibleNumbers", insights.possibleNumbers, (item) => ({
    title: item.value,
    subtitle: `${item.confidence} | ${item.reason}`,
  }));
  renderChipList("risingHouses", insights.shiftSummary.risingHouses, (item) => ({
    title: `House ${item.value}`,
    subtitle: `Shift +${item.shift}`,
  }));
  renderChipList("risingEndings", insights.shiftSummary.risingEndings, (item) => ({
    title: `Ending ${item.value}`,
    subtitle: `Shift +${item.shift}`,
  }));
}

function isResolvedToken(value) {
  return /^\d{2}$/.test(value || "");
}

function getDisplayLive(payload) {
  const latestHistory = payload.history?.[0];
  const displayLive = { ...payload.live };

  if (!latestHistory) return displayLive;

  const liveResolvedCount = [payload.live.firstRound, payload.live.secondRound].filter(isResolvedToken).length;
  const historyResolvedCount = [latestHistory.firstRound, latestHistory.secondRound].filter(isResolvedToken).length;

  if (
    latestHistory.isoDate &&
    (
      !payload.live.isoDate ||
      latestHistory.isoDate > payload.live.isoDate ||
      (latestHistory.isoDate === payload.live.isoDate && historyResolvedCount > liveResolvedCount)
    )
  ) {
    displayLive.date = latestHistory.date;
    displayLive.isoDate = latestHistory.isoDate;
    displayLive.firstRound = latestHistory.firstRound;
    displayLive.secondRound = latestHistory.secondRound;
    displayLive.resultSource = "latest-history";
  }

  return displayLive;
}

function renderDashboard(payload) {
  const displayLive = getDisplayLive(payload);

  document.getElementById("liveDate").textContent = displayLive.date || "--";
  document.getElementById("firstRound").textContent = displayLive.firstRound || "--";
  document.getElementById("secondRound").textContent = displayLive.secondRound || "--";
  document.getElementById("lastUpdated").textContent = `Updated ${new Date(payload.meta.fetchedAt).toLocaleString()}`;

  document.getElementById("liveSourceLabel").textContent =
    (displayLive.resultSource || payload.meta.liveDisplaySource) === "latest-history"
      ? "Showing latest confirmed result from history feed"
      : payload.live.fromCache
        ? "Showing cached live snapshot"
        : "Live page fetched successfully";

  document.getElementById("resultStatus").textContent =
    isResolvedToken(displayLive.firstRound) && isResolvedToken(displayLive.secondRound)
      ? "Both rounds available"
      : isResolvedToken(displayLive.firstRound)
        ? "First round available"
        : "Waiting for official live values";

  document.getElementById("refreshStatus").textContent = payload.meta.autoRefresh?.refreshInProgress
    ? "Background refresh running"
    : `Server auto refresh every ${payload.meta.autoRefresh?.intervalSeconds || 60}s`;

  renderChipList("publishedCommonNumbers", displayLive.commonNumbers || payload.live.commonNumbers, (item) => ({
    title: item,
    subtitle: payload.meta.commonNumbersSource === "algorithm" ? "Trend model" : "Source page",
  }));

  renderInsights(payload.predictions);
  renderBarChart("houseChart", payload.analytics.houseFrequency);
  renderBarChart("endingChart", payload.analytics.endingFrequency);
  renderChipList("strongDirectNumbers", payload.analytics.strongestDirect, (item) => ({
    title: item.value,
    subtitle: `${item.count} times`,
  }));
  renderChipList("recentShiftNumbers", payload.analytics.recentShiftNumbers, (item) => ({
    title: item.value,
    subtitle: `Last 21 draws: ${item.count}`,
  }));
  renderMonthlyTrend(payload.analytics.months);

  state.history = payload.history;
  state.dreamNumbers = payload.dreamNumbers || [];
  renderHistoryTable(state.history);
  renderDreamSearch();
  renderDreamTable();
}

function updateCountdownLabel() {
  const target = document.getElementById("refreshCountdown");
  if (!state.autoRefreshEnabled) {
    target.textContent = "Auto refresh paused";
    return;
  }
  target.textContent = `Next refresh in ${state.refreshCountdown}s`;
}

function clearAutoRefresh() {
  if (state.refreshTimerId) clearInterval(state.refreshTimerId);
  if (state.refreshCountdownId) clearInterval(state.refreshCountdownId);
  state.refreshTimerId = null;
  state.refreshCountdownId = null;
}

function startAutoRefresh() {
  clearAutoRefresh();
  state.refreshCountdown = REFRESH_INTERVAL_SECONDS;
  updateCountdownLabel();

  if (!state.autoRefreshEnabled) return;

  state.refreshCountdownId = setInterval(() => {
    state.refreshCountdown = state.refreshCountdown > 1 ? state.refreshCountdown - 1 : REFRESH_INTERVAL_SECONDS;
    updateCountdownLabel();
  }, 1000);

  state.refreshTimerId = setInterval(() => {
    loadDashboard(true).catch((error) => {
      document.getElementById("lastUpdated").textContent = error.message;
    });
    state.refreshCountdown = REFRESH_INTERVAL_SECONDS;
    updateCountdownLabel();
  }, REFRESH_INTERVAL_SECONDS * 1000);
}

async function loadDashboard(refresh = false) {
  const url = refresh ? "/api/dashboard?days=365&refresh=1" : "/api/dashboard?days=365";
  const payload = await fetchJson(url);
  renderDashboard(payload);
}

async function handleInsightsSubmit(event) {
  event.preventDefault();

  const fr = document.getElementById("seedFr").value.trim();
  const sr = document.getElementById("seedSr").value.trim();
  const params = new URLSearchParams();

  if (fr) params.set("fr", fr);
  if (sr) params.set("sr", sr);

  const query = params.toString();
  const payload = await fetchJson(`/api/insights${query ? `?${query}` : ""}`);
  renderInsights(payload);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

document.getElementById("refreshButton").addEventListener("click", () => {
  state.refreshCountdown = REFRESH_INTERVAL_SECONDS;
  updateCountdownLabel();
  loadDashboard(true).catch((error) => {
    document.getElementById("lastUpdated").textContent = error.message;
  });
});

document.getElementById("insightsForm").addEventListener("submit", (event) => {
  handleInsightsSubmit(event).catch((error) => {
    document.getElementById("insightNote").textContent = error.message;
  });
});

document.getElementById("historyFilter").addEventListener("input", () => {
  renderHistoryTable(state.history);
});

document.getElementById("dreamSearch").addEventListener("input", () => {
  renderDreamSearch();
});

document.getElementById("dreamTableFilter").addEventListener("input", () => {
  renderDreamTable();
});

document.getElementById("autoRefreshToggle").addEventListener("change", (event) => {
  state.autoRefreshEnabled = event.target.checked;
  startAutoRefresh();
});

document.getElementById("copyrightYear").textContent = new Date().getFullYear();
registerServiceWorker();
startAutoRefresh();

loadDashboard().catch((error) => {
  document.getElementById("lastUpdated").textContent = error.message;
});
