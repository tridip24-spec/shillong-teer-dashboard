const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const LIVE_CACHE_PATH = path.join(DATA_DIR, "live-cache.json");
const HISTORY_CACHE_PATH = path.join(DATA_DIR, "history-cache.json");

const LIVE_URL = "https://shillongteer.com/";
const HISTORY_URL = "https://shillongteer.com/previous-results/";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function ensureDir(target) {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
}
ensureDir(DATA_DIR);

function cleanText(value) {
  return value.replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeNumberToken(value) {
  if (!value) return null;
  const token = value.trim().toUpperCase();
  if (/^\d{1,2}$/.test(token)) return token.padStart(2, "0");
  if (token === "-" || token === "XX" || token === "OFF") return "XX";
  return null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`Failed request ${response.status} for ${url}`);
  return response.text();
}

// --- Live scraping ---
function extractLiveRoundsFallback(html) {
  const normalized = cleanText(html);
  const firstLabelMatch = normalized.match(/(First\s*Round|FR)[^0-9]*(XX|OFF|\d{2})/i);
  const secondLabelMatch = normalized.match(/(Second\s*Round|SR)[^0-9]*(XX|OFF|\d{2})/i);

  return {
    firstRound: safeNumberToken(firstLabelMatch?.[2] || null),
    secondRound: safeNumberToken(secondLabelMatch?.[2] || null),
  };
}

function parseLivePage(html) {
  const fallbackRounds = extractLiveRoundsFallback(html);
  return {
    date: new Date().toISOString().slice(0, 10),
    isoDate: new Date().toISOString().slice(0, 10),
    firstRound: fallbackRounds.firstRound || "XX",
    secondRound: fallbackRounds.secondRound || "XX",
  };
}

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return fallback; }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function isCacheFresh(cacheValue, ttlMs) {
  if (!cacheValue?.fetchedAt) return false;
  const fetchedAt = new Date(cacheValue.fetchedAt).getTime();
  return Date.now() - fetchedAt < ttlMs;
}

async function loadLive(forceRefresh = false) {
  const cached = readJson(LIVE_CACHE_PATH, null);
  if (!forceRefresh && cached?.date && isCacheFresh(cached, 60000)) {
    return { ...cached, fromCache: true };
  }
  try {
    const html = await fetchText(LIVE_URL);
    const result = parseLivePage(html);
    const payload = { fetchedAt: new Date().toISOString(), sourceUrl: LIVE_URL, ...result };
    writeJson(LIVE_CACHE_PATH, payload);
    return { ...payload, fromCache: false };
  } catch (error) {
    if (cached?.date) return { ...cached, fromCache: true, warning: error.message };
    throw error;
  }
}

async function loadHistory(forceRefresh = false) {
  const cached = readJson(HISTORY_CACHE_PATH, null);
  if (!forceRefresh && cached?.rows?.length && isCacheFresh(cached, 600000)) {
    return { ...cached, fromCache: true };
  }
  try {
    const html = await fetchText(HISTORY_URL);
    // Simplified: just extract rows with regex
    const rows = [];
    for (const match of html.matchAll(/<tr><td>(\d{2}-\d{2}-\d{4})<\/td><td[^>]*>([0-9A-Z]{2,3})<\/td><td[^>]*>([0-9A-Z]{2,3})<\/td><\/tr>/g)) {
      rows.push({ date: match[1], firstRound: safeNumberToken(match[2]), secondRound: safeNumberToken(match[3]) });
    }
    const payload = { fetchedAt: new Date().toISOString(), sourceUrl: HISTORY_URL, rows };
    writeJson(HISTORY_CACHE_PATH, payload);
    return { ...payload, fromCache: false };
  } catch (error) {
    if (cached?.rows?.length) return { ...cached, fromCache: true, warning: error.message };
    throw error;
  }
}

// --- JSON response helper ---
function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
  });
  response.end(JSON.stringify(payload));
}

// --- static file serving ---
function serveStatic(requestPath, response) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const targetPath = path.normalize(path.join(PUBLIC_DIR, normalized));
  if (!targetPath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403); response.end("Forbidden"); return;
  }
  fs.readFile(targetPath, (error, fileBuffer) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const extension = path.extname(targetPath);
    response.writeHead(200, {
      "content-type": MIME_TYPES[extension] || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-cache" : "public, max-age=300",
    });
    response.end(fileBuffer);
  });
}

// --- main server ---
const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (requestUrl.pathname === "/api/live") {
      const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
      const livePayload = await loadLive(forceRefresh);
      jsonResponse(response, 200, livePayload);
      return;
    }
    if (requestUrl.pathname === "/api/history") {
      const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
      const historyPayload = await loadHistory(forceRefresh);
      jsonResponse(response, 200, historyPayload);
      return;
    }
    if (requestUrl.pathname === "/api/dashboard") {
      const [historyPayload, livePayload] = await Promise.all([loadHistory(false), loadLive(false)]);
      jsonResponse(response, 200, { live: livePayload, history: historyPayload.rows });
      return;
    }
    serveStatic(requestUrl.pathname, response);
  } catch (err) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
