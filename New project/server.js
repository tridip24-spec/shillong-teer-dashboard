const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_CACHE_PATH = path.join(DATA_DIR, "history-cache.json");
const LIVE_CACHE_PATH = path.join(DATA_DIR, "live-cache.json");

const LIVE_URL = "https://shillongteer.com/";
const HISTORY_URL = "https://shillongteer.com/previous-results/";
const SUPPLEMENTAL_HISTORY_URL = "https://shillongteerresultlist.co.in/";
const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

ensureDir(DATA_DIR);

function ensureDir(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function parseDdMmYyyy(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
}

function parseDdMmYyyyDot(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
}

function formatIsoDate(dateString) {
  const date = parseDdMmYyyy(dateString);
  return date ? date.toISOString().slice(0, 10) : null;
}

function formatIsoDateFromAny(dateString) {
  const dashDate = parseDdMmYyyy(dateString);
  if (dashDate) return dashDate.toISOString().slice(0, 10);
  const dotDate = parseDdMmYyyyDot(dateString);
  return dotDate ? dotDate.toISOString().slice(0, 10) : null;
}

function formatDisplayDateFromIso(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, yyyy, mm, dd] = match;
  return `${dd}-${mm}-${yyyy}`;
}

function cleanText(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeNumberToken(value) {
  if (!value) return null;
  const token = value.trim().toUpperCase();
  if (/^\d{1,2}$/.test(token)) {
    return padNumber(token);
  }
  if (token === "-") {
    return "XX";
  }
  if (token === "OFF" || token === "XX") {
    return token;
  }
  return null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://shillongteerresultlist.co.in/",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed request ${response.status} for ${url}`);
  }

  return response.text();
}

function parseHistoryPage(html) {
  const rows = [];
  const rowPattern =
    /<tr>\s*<td>(\d{2}-\d{2}-\d{4})<\/td>\s*<td[^>]*class="rnum"[^>]*>([A-Z0-9]{2,3})<\/td>\s*<td[^>]*class="rnum"[^>]*>([A-Z0-9]{2,3})<\/td>\s*<\/tr>/g;

  for (const match of html.matchAll(rowPattern)) {
    const date = match[1];
    const firstRound = safeNumberToken(match[2]);
    const secondRound = safeNumberToken(match[3]);

    if (!firstRound || !secondRound) continue;

    rows.push({
      date,
      isoDate: formatIsoDate(date),
      firstRound,
      secondRound,
      isOffDay: firstRound === "OFF" || secondRound === "OFF",
    });
  }

  return rows;
}

function parseSupplementalHistoryPage(html) {
  const rows = [];
  const rowPattern =
    /<tr[^>]*>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*>\s*([A-Z0-9-]{1,3})\s*<\/td>\s*<td[^>]*>\s*([A-Z0-9-]{1,3})\s*<\/td>\s*<\/tr>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const sourceDate = cleanText(match[1]).replace(/\./g, "-");
    const isoDate = formatIsoDateFromAny(sourceDate);
    const firstRound = safeNumberToken(match[2]);
    const secondRound = safeNumberToken(match[3]);

    if (!isoDate || !firstRound || !secondRound) continue;

    rows.push({
      date: formatDisplayDateFromIso(isoDate),
      isoDate,
      firstRound,
      secondRound,
      isOffDay: firstRound === "OFF" || secondRound === "OFF",
    });
  }

  return rows;
}

function parseLivePage(html) {
  const dateMatch = html.match(/<strong>Date:\s*<\/strong>([^|<]+)/i);
  const roundMatch = html.match(
    /<div class="rb"><div class="rc"><div class="rn">([A-Z0-9]{2,3})<\/div><\/div><div class="rc"><div class="rn">([A-Z0-9]{2,3})<\/div><\/div><\/div>/i
  );

  const commonNumbers = [];
  for (const match of html.matchAll(/<div class="nc">(\d{2})<\/div>/g)) {
    commonNumbers.push(match[1]);
  }

  return {
    date: dateMatch ? cleanText(dateMatch[1]) : null,
    isoDate: dateMatch ? formatIsoDate(cleanText(dateMatch[1])) : null,
    firstRound: roundMatch ? safeNumberToken(roundMatch[1]) : null,
    secondRound: roundMatch ? safeNumberToken(roundMatch[2]) : null,
    commonNumbers,
  };
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
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < ttlMs;
}

async function loadHistory(forceRefresh = false) {
  const cached = readJson(HISTORY_CACHE_PATH, null);
  if (!forceRefresh && cached?.rows?.length && isCacheFresh(cached, HISTORY_CACHE_TTL_MS)) {
    return { ...cached, fromCache: true };
  }

  try {
    const [archiveHtml, supplementalHtml] = await Promise.all([
      fetchText(HISTORY_URL),
      fetchText(SUPPLEMENTAL_HISTORY_URL),
    ]);
    const archiveRows = parseHistoryPage(archiveHtml);
    const supplementalRows = parseSupplementalHistoryPage(supplementalHtml);
    const rows = [...new Map([...supplementalRows, ...archiveRows].map(r => [r.isoDate, r])).values()]
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
    const payload = {
      fetchedAt: new Date().toISOString
