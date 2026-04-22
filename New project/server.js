const http = require("http");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // make sure node-fetch is installed

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
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return fallback; }
}

function isCacheFresh(cacheValue, ttlMs) {
  if (!cacheValue?.fetchedAt) return false;
  const fetchedAt = new Date(cacheValue.fetchedAt).getTime();
  return Date.now() - fetchedAt < ttlMs;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Failed ${response.status} for ${url}`);
  return response.text();
}

function parseHistoryPage(html) {
  const rows = [];
  const rowPattern = /<tr>\s*<td>(\d{2}-\d{2}-\d{4})<\/td>\s*<td[^>]*>([0-9A-Z]{2,3})<\/td>\s*<td[^>]*>([0-9A-Z]{2,3})<\/td>\s*<\/tr>/g;
  for (const match of html.matchAll(rowPattern)) {
    rows.push({ date: match[1], firstRound: match[2], secondRound: match[3] });
  }
  return rows;
}

function parseLivePage(html) {
  const dateMatch = html.match(/<strong>Date:\s*<\/strong>([^|<]+)/i);
  const roundMatch = html.match(/<div class="rn">([0-9A-Z]{2,3})<\/div>.*?<div class="rn">([0-9A-Z]{2,3})<\/div>/is);
  return {
    date: dateMatch ? dateMatch[1].trim() : null,
    firstRound: roundMatch ? roundMatch[1] : null,
    secondRound: roundMatch ? roundMatch[2] : null
  };
}

async function loadHistory(forceRefresh = false) {
  const cached = readJson(HISTORY_CACHE_PATH, null);
  if (!forceRefresh && cached?.rows?.length && isCacheFresh(cached, HISTORY_CACHE_TTL_MS)) return { ...cached, fromCache: true };
  const html = await fetchText(HISTORY_URL);
  const rows = parseHistoryPage(html);
  const payload = { fetchedAt: new Date().toISOString(), rows };
  writeJson(HISTORY_CACHE_PATH, payload);
  return { ...payload, fromCache: false };
}

async function loadLive(forceRefresh = false) {
  const cached = readJson(LIVE_CACHE_PATH, null);
  if (!forceRefresh && cached?.date && isCacheFresh(cached, LIVE_CACHE_TTL_MS)) return { ...cached, fromCache: true };
  const html = await fetchText(LIVE_URL);
  const result = parseLivePage(html);
  const payload = { fetchedAt: new Date().toISOString(), ...result };
  writeJson(LIVE_CACHE_PATH, payload);
  return { ...payload, fromCache: false };
}

// HTTP server
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/live") {
      const live = await loadLive();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(live));
    } else if (req.url === "/api/history") {
      const history = await loadHistory();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(history));
    } else if (req.url === "/api/dashboard") {
      const live = await loadLive();
      const history = await loadHistory();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ live, history }));
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Shillong Teer Dashboard is running!");
    }
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
