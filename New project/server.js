const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_CACHE_PATH = path.join(DATA_DIR, "history-cache.json");
const LIVE_CACHE_PATH = path.join(DATA_DIR, "live-cache.json");

const LIVE_URL = "https://shillongteer.com/";
const HISTORY_URL = "https://shillongteer.com/previous-results/";
const SUPPLEMENTAL_HISTORY_URL = "https://shillongteerresultlist.co.in/";
const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

ensureDir(DATA_DIR);

function ensureDir(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function isCacheFresh(cacheValue, ttlMs) {
  if (!cacheValue?.fetchedAt) return false;
  const fetchedAt = new Date(cacheValue.fetchedAt).getTime();
  return Date.now() - fetchedAt < ttlMs;
}

async function loadHistory(forceRefresh = false) {
  const cached = readJson(HISTORY_CACHE_PATH, null);
  if (!forceRefresh && cached?.rows?.length && isCacheFresh(cached, HISTORY_CACHE_TTL_MS)) {
    return { ...cached, fromCache: true };
  }
  try {
    // Simplified for now
    const rows = [{ date: "01-01-2026", firstRound: "12", secondRound: "34" }];
    const payload = { fetchedAt: new Date().toISOString(), rows };
    writeJson(HISTORY_CACHE_PATH, payload);
    return { ...payload, fromCache: false };
  } catch (error) {
    if (cached?.rows?.length) return { ...cached, fromCache: true, warning: error.message };
    throw error;
  }
}

async function loadLive(forceRefresh = false) {
  const cached = readJson(LIVE_CACHE_PATH, null);
  if (!forceRefresh && cached?.date && isCacheFresh(cached, LIVE_CACHE_TTL_MS)) {
    return { ...cached, fromCache: true };
  }
  try {
    // Simplified for now
    const payload = {
      fetchedAt: new Date().toISOString(),
      date: "22-04-2026",
      firstRound: "15",
      secondRound: "28",
      commonNumbers: ["12", "34", "56"]
    };
    writeJson(LIVE_CACHE_PATH, payload);
    return { ...payload, fromCache: false };
  } catch (error) {
    if (cached?.date) return { ...cached, fromCache: true, warning: error.message };
    throw error;
  }
}

// Create and start the HTTP server
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/live") {
    const live = await loadLive();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(live));
  } else if (req.url === "/api/history") {
    const history = await loadHistory();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(history));
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Shillong Teer Dashboard is running!");
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
