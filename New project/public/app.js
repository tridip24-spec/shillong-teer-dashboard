const REFRESH_INTERVAL_SECONDS = 30;

const DREAM_NUMBER_MAP = [
  { symbol: "Snake", number: "07", category: "Animal" },
  { symbol: "Water", number: "18", category: "Nature" },
  { symbol: "Fish", number: "28", category: "Animal" },
  { symbol: "Temple", number: "09", category: "Spiritual" },
  { symbol: "River", number: "35", category: "Nature" },
  { symbol: "Baby", number: "14", category: "People" },
  { symbol: "Marriage", number: "24", category: "Life event" },
  { symbol: "Death", number: "00", category: "Symbolic" },
  { symbol: "Gold", number: "48", category: "Object" },
  { symbol: "Fire", number: "13", category: "Nature" },
  { symbol: "House", number: "25", category: "Place" },
  { symbol: "Elephant", number: "72", category: "Animal" },
  { symbol: "Tiger", number: "57", category: "Animal" },
  { symbol: "Dog", number: "21", category: "Animal" },
  { symbol: "Cat", number: "16", category: "Animal" },
  { symbol: "Rain", number: "62", category: "Nature" },
  { symbol: "Blood", number: "89", category: "Symbolic" },
  { symbol: "Flying", number: "51", category: "Motion" },
  { symbol: "Falling", number: "40", category: "Motion" },
  { symbol: "Mother", number: "31", category: "People" },
  { symbol: "Father", number: "32", category: "People" },
  { symbol: "Child", number: "11", category: "People" },
  { symbol: "Money", number: "83", category: "Object" },
  { symbol: "Jewellery", number: "95", category: "Object" },
  { symbol: "Cow", number: "46", category: "Animal" },
  { symbol: "Bird", number: "63", category: "Animal" },
  { symbol: "Moon", number: "52", category: "Nature" },
  { symbol: "Sun", number: "19", category: "Nature" },
  { symbol: "Tree", number: "64", category: "Nature" },
  { symbol: "Climbing", number: "38", category: "Motion" },
  { symbol: "Boat", number: "44", category: "Travel" },
  { symbol: "Road", number: "23", category: "Travel" },
  { symbol: "School", number: "17", category: "Place" },
  { symbol: "Market", number: "54", category: "Place" },
  { symbol: "Doctor", number: "68", category: "People" },
  { symbol: "Police", number: "76", category: "People" },
  { symbol: "Wedding dress", number: "84", category: "Object" },
  { symbol: "Fruit", number: "27", category: "Food" },
  { symbol: "Flower", number: "41", category: "Nature" },
  { symbol: "Storm", number: "93", category: "Nature" },
];

const state = {
  history: [],
  autoRefreshEnabled: true,
  refreshCountdown: REFRESH_INTERVAL_SECONDS,
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
