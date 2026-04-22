const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const LIVE_CACHE_PATH = path.join(DATA_DIR, "live-cache.json");

const LIVE_URL = "https://shillongteer.com/";
const LIVE_CACHE_TTL_MS = 30 * 1000; // 🔥 30 sec only

ensureDir(DATA_DIR);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function safeNum(val) {
  if (!val) return null;
  const t = val.trim().toUpperCase();
  if (/^\d{1,2}$/.test(t)) return pad(t);
  if (t === "-" || t === "XX" || t === "OFF") return "XX";
  return null;
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0",
        },
      });
      if (!res.ok) throw new Error("Bad response");
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function parseLive(html) {
  const roundMatch = html.match(
    /<div class="rb">[\s\S]*?<div class="rn">([A-Z0-9]{2,3})<\/div>[\s\S]*?<div class="rn">([A-Z0-9]{2,3})<\/div>/i
  );

  const dateMatch = html.match(/Date:\s*<\/strong>([^<]+)/i);

  return {
    date: dateMatch ? dateMatch[1].trim() : null,
    firstRound: roundMatch ? safeNum(roundMatch[1]) : null,
    secondRound: roundMatch ? safeNum(roundMatch[2]) : null,
  };
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(LIVE_CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(data) {
  fs.writeFileSync(LIVE_CACHE_PATH, JSON.stringify(data, null, 2));
}

async function getLiveResult() {
  const cached = readCache();

  try {
    const html = await fetchWithRetry(LIVE_URL);
    const parsed = parseLive(html);

    // 🔥 If valid result → save fresh
    if (parsed.firstRound && parsed.firstRound !== "XX") {
      const payload = {
        fetchedAt: new Date().toISOString(),
        ...parsed,
      };
      writeCache(payload);
      return { ...payload, source: "live" };
    }

    // ⚠️ If still XX → fallback to cache
    if (cached) {
      return { ...cached, source: "cache-fallback" };
    }

    return { ...parsed, source: "live-xx" };

  } catch (err) {
    if (cached) return { ...cached, source: "cache-error" };
    return { error: "Failed to fetch live result" };
  }
}

function serveStatic(filePath, res) {
  const full = path.join(PUBLIC_DIR, filePath === "/" ? "index.html" : filePath);

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (urlObj.pathname === "/api/live") {
      const data = await getLiveResult();

      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });

      res.end(JSON.stringify(data));
      return;
    }

    serveStatic(urlObj.pathname, res);
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
