const http = require("http");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // add to package.json

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_CACHE_PATH = path.join(DATA_DIR, "history-cache.json");
const LIVE_CACHE_PATH = path.join(DATA_DIR, "live-cache.json");

const LIVE_URL = "https://shillongteer.com/";
const HISTORY_URL = "https://shillongteer.com/previous-results/";

const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

// --- Parsing helpers ---
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

// --- Loaders ---
async function load
