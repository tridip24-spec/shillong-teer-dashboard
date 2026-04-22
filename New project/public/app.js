const state = {
  history: [],
  autoRefreshEnabled: true,
  refreshCountdown: 60,
  refreshTimerId: null,
  refreshCountdownId: null,
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

function renderInsights(insights) {
  const source = insights.generatedFrom
    ? `${insights.generatedFrom.date} • FR ${insights.generatedFrom.firstRound} • SR ${insights.generatedFrom.secondRound}`
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
    subtitle: `${item.confidence} • ${item.reason}`,
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

function renderDashboard(payload) {
  document.getElementById("liveDate").textContent = payload.live.date || "--";
  document.getElementById("firstRound").textContent = payload.live.firstRound || "--";
  document.getElementById("secondRound").textContent = payload.live.secondRound || "--";
  document.getElementById("lastUpdated").textContent = `Updated ${new Date(payload.meta.fetchedAt).toLocaleString()}`;
  document.getElementById("liveSourceLabel").textContent = payload.live.fromCache
    ? "Showing cached live snapshot"
    : "Live page fetched successfully";

  renderChipList("publishedCommonNumbers", payload.live.commonNumbers, (item) => ({
    title: item,
    subtitle: "Source page",
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
  renderHistoryTable(state.history);
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
  state.refreshCountdown = 60;
  updateCountdownLabel();

  if (!state.autoRefreshEnabled) return;

  state.refreshCountdownId = setInterval(() => {
    state.refreshCountdown = state.refreshCountdown > 1 ? state.refreshCountdown - 1 : 60;
    updateCountdownLabel();
  }, 1000);

  state.refreshTimerId = setInterval(() => {
    loadDashboard(true).catch((error) => {
      document.getElementById("lastUpdated").textContent = error.message;
    });
    state.refreshCountdown = 60;
    updateCountdownLabel();
  }, 60000);
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
  state.refreshCountdown = 60;
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
