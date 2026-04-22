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

function formatIsoDate(dateString) {
  const date = parseDdMmYyyy(dateString);
  return date ? date.toISOString().slice(0, 10) : null;
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
  if (token === "OFF" || token === "XX") {
    return token;
  }
  return null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Codex Shillong Teer Dashboard",
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

function parseLivePage(html) {
  const dateMatch = html.match(/<strong>Date:\s*<\/strong>([^|<]+)/i);
  const roundMatch = html.match(
    /<div class="rb"><div class="rc"><div class="rn">([A-Z0-9]{2,3})<\/div><\/div><div class="rc"><div class="rn">([A-Z0-9]{2,3})<\/div><\/div><\/div>/i
  );

  const commonNumbers = [];
  for (const match of html.matchAll(/<div class="nc">(\d{2})<\/div>/g)) {
    commonNumbers.push(match[1]);
  }

  const recentRows = [];
  const recentPattern =
    /<tr><td>(\d{2}-\d{2}-\d{4})<\/td><td class="rnum">([A-Z0-9]{2,3})<\/td><td class="rnum">([A-Z0-9]{2,3})<\/td><\/tr>/g;
  for (const match of html.matchAll(recentPattern)) {
    recentRows.push({
      date: match[1],
      isoDate: formatIsoDate(match[1]),
      firstRound: safeNumberToken(match[2]),
      secondRound: safeNumberToken(match[3]),
    });
  }

  return {
    date: dateMatch ? cleanText(dateMatch[1]) : null,
    isoDate: dateMatch ? formatIsoDate(cleanText(dateMatch[1])) : null,
    firstRound: roundMatch ? safeNumberToken(roundMatch[1]) : null,
    secondRound: roundMatch ? safeNumberToken(roundMatch[2]) : null,
    commonNumbers,
    recentRows,
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

async function loadHistory(forceRefresh = false) {
  const cached = readJson(HISTORY_CACHE_PATH, null);
  if (!forceRefresh && cached?.rows?.length) {
    return { ...cached, fromCache: true };
  }

  try {
    const html = await fetchText(HISTORY_URL);
    const rows = parseHistoryPage(html);
    const payload = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: HISTORY_URL,
      rows,
    };
    writeJson(HISTORY_CACHE_PATH, payload);
    return { ...payload, fromCache: false };
  } catch (error) {
    if (cached?.rows?.length) {
      return { ...cached, fromCache: true, warning: error.message };
    }
    throw error;
  }
}

async function loadLive(forceRefresh = false) {
  const cached = readJson(LIVE_CACHE_PATH, null);
  if (!forceRefresh && cached?.date) {
    return { ...cached, fromCache: true };
  }

  try {
    const html = await fetchText(LIVE_URL);
    const result = parseLivePage(html);
    const payload = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: LIVE_URL,
      ...result,
    };
    writeJson(LIVE_CACHE_PATH, payload);
    return { ...payload, fromCache: false };
  } catch (error) {
    if (cached?.date) {
      return { ...cached, fromCache: true, warning: error.message };
    }
    throw error;
  }
}

function getLastNDaysHistory(rows, days = 365) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  return rows.filter((row) => {
    if (!row.isoDate || row.isOffDay) return false;
    return new Date(`${row.isoDate}T00:00:00.000Z`) >= cutoff;
  });
}

function getDigits(numberToken) {
  if (!/^\d{2}$/.test(numberToken)) return null;
  return {
    direct: numberToken,
    house: Number(numberToken[0]),
    ending: Number(numberToken[1]),
  };
}

function weightedCounter() {
  return new Map();
}

function addWeighted(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function rankMap(map, formatter) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([key, score]) => formatter(key, score));
}

function calculatePrediction(historyRows, customSeed) {
  const usable = historyRows.filter(
    (row) => /^\d{2}$/.test(row.firstRound) && /^\d{2}$/.test(row.secondRound)
  );
  const recent = usable.slice(0, 30);
  const medium = usable.slice(0, 90);
  const long = usable.slice(0, 180);

  const houseScores = weightedCounter();
  const endingScores = weightedCounter();
  const directScores = weightedCounter();
  const movementScores = weightedCounter();

  const allSegments = [
    { rows: recent, weight: 3 },
    { rows: medium, weight: 2 },
    { rows: long, weight: 1 },
  ];

  for (const segment of allSegments) {
    for (const row of segment.rows) {
      for (const token of [row.firstRound, row.secondRound]) {
        const digits = getDigits(token);
        if (!digits) continue;
        addWeighted(houseScores, digits.house, segment.weight);
        addWeighted(endingScores, digits.ending, segment.weight);
        addWeighted(directScores, digits.direct, segment.weight);
      }

      const movementBase =
        (Number(row.firstRound[0]) +
          Number(row.firstRound[1]) +
          Number(row.secondRound[0]) +
          Number(row.secondRound[1])) %
        10;

      [movementBase, (movementBase + 1) % 10, (movementBase + 9) % 10].forEach(
        (ending) => addWeighted(movementScores, ending, segment.weight)
      );
    }
  }

  const latest = customSeed || usable[0];
  const latestFirst = getDigits(latest?.firstRound || "");
  const latestSecond = getDigits(latest?.secondRound || "");
  const seedEnding =
    latestFirst && latestSecond
      ? (latestFirst.house +
          latestFirst.ending +
          latestSecond.house +
          latestSecond.ending) %
        10
      : null;

  if (seedEnding !== null) {
    [seedEnding, (seedEnding + 1) % 10, (seedEnding + 9) % 10].forEach((ending) =>
      addWeighted(endingScores, ending, 5)
    );
  }

  if (latestFirst) {
    addWeighted(houseScores, latestFirst.house, 4);
    addWeighted(endingScores, latestFirst.ending, 2);
  }

  if (latestSecond) {
    addWeighted(houseScores, latestSecond.house, 4);
    addWeighted(endingScores, latestSecond.ending, 2);
  }

  const topHouses = rankMap(houseScores, (value, score) => ({
    value: Number(value),
    score,
  })).slice(0, 4);

  const topEndings = rankMap(endingScores, (value, score) => ({
    value: Number(value),
    score,
  })).slice(0, 5);

  const topDirect = rankMap(directScores, (value, score) => ({
    value,
    score,
  })).slice(0, 8);

  const movementEndings = rankMap(movementScores, (value, score) => ({
    value: Number(value),
    score,
  })).slice(0, 5);

  const suggestionSet = new Set();
  const commonNumbers = [];

  function pushSuggestion(value, reason) {
    if (suggestionSet.has(value)) return;
    suggestionSet.add(value);
    commonNumbers.push({ value, reason });
  }

  for (const house of topHouses) {
    for (const ending of topEndings.slice(0, 3)) {
      pushSuggestion(`${house.value}${ending.value}`, "House + ending trend");
    }
  }

  for (const direct of topDirect.slice(0, 4)) {
    pushSuggestion(direct.value, "Recent direct repeat");
  }

  for (const house of topHouses.slice(0, 2)) {
    for (const ending of movementEndings.slice(0, 2)) {
      pushSuggestion(`${house.value}${ending.value}`, "Movement formula");
    }
  }

  return {
    generatedFrom: latest
      ? {
          date: latest.date,
          firstRound: latest.firstRound,
          secondRound: latest.secondRound,
        }
      : null,
    topHouses,
    topEndings,
    topDirect,
    movementEndings,
    commonNumbers: commonNumbers.slice(0, 12),
    note:
      "These are informational trend signals from recent movement only. They are not guaranteed outcomes.",
  };
}

function calculateAnalytics(historyRows) {
  const usable = historyRows.filter(
    (row) => /^\d{2}$/.test(row.firstRound) && /^\d{2}$/.test(row.secondRound)
  );

  const houseFrequency = Array.from({ length: 10 }, (_, value) => ({
    value,
    count: 0,
  }));
  const endingFrequency = Array.from({ length: 10 }, (_, value) => ({
    value,
    count: 0,
  }));
  const repeatedDirect = new Map();
  const monthlyTrend = new Map();

  for (const row of usable) {
    const monthKey = row.isoDate ? row.isoDate.slice(0, 7) : "unknown";
    const monthEntry = monthlyTrend.get(monthKey) || {
      month: monthKey,
      total: 0,
      houses: Array(10).fill(0),
      endings: Array(10).fill(0),
    };

    for (const token of [row.firstRound, row.secondRound]) {
      const digits = getDigits(token);
      if (!digits) continue;
      houseFrequency[digits.house].count += 1;
      endingFrequency[digits.ending].count += 1;
      addWeighted(repeatedDirect, digits.direct, 1);
      monthEntry.total += 1;
      monthEntry.houses[digits.house] += 1;
      monthEntry.endings[digits.ending] += 1;
    }

    monthlyTrend.set(monthKey, monthEntry);
  }

  const strongestDirect = rankMap(repeatedDirect, (value, score) => ({
    value,
    count: score,
  })).slice(0, 12);

  const months = [...monthlyTrend.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((entry) => {
      const housePeak = Math.max(...entry.houses);
      const endingPeak = Math.max(...entry.endings);

      return {
        month: entry.month,
        busiestHouse: entry.houses.indexOf(housePeak),
        busiestEnding: entry.endings.indexOf(endingPeak),
        total: entry.total,
      };
    });

  return {
    houseFrequency,
    endingFrequency,
    strongestDirect,
    months,
  };
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function serveStatic(requestPath, response) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const targetPath = path.normalize(path.join(PUBLIC_DIR, normalized));

  if (!targetPath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
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
    });
    response.end(fileBuffer);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (requestUrl.pathname === "/api/dashboard") {
      const days = Math.max(30, Math.min(365, Number(requestUrl.searchParams.get("days")) || 365));
      const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
      const [historyPayload, livePayload] = await Promise.all([
        loadHistory(forceRefresh),
        loadLive(forceRefresh),
      ]);
      const history = getLastNDaysHistory(historyPayload.rows, days);
      const predictions = calculatePrediction(history);
      const analytics = calculateAnalytics(history);

      jsonResponse(response, 200, {
        live: livePayload,
        history,
        predictions,
        analytics,
        meta: {
          historySource: historyPayload.sourceUrl,
          liveSource: livePayload.sourceUrl,
          fetchedAt: new Date().toISOString(),
          usedCache: historyPayload.fromCache || livePayload.fromCache,
          warnings: [historyPayload.warning, livePayload.warning].filter(Boolean),
        },
      });
      return;
    }

    if (requestUrl.pathname === "/api/history") {
      const days = Math.max(30, Math.min(365, Number(requestUrl.searchParams.get("days")) || 365));
      const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
      const historyPayload = await loadHistory(forceRefresh);
      const history = getLastNDaysHistory(historyPayload.rows, days);
      jsonResponse(response, 200, history);
      return;
    }

    if (requestUrl.pathname === "/api/live") {
      const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
      const livePayload = await loadLive(forceRefresh);
      jsonResponse(response, 200, livePayload);
      return;
    }

    if (requestUrl.pathname === "/api/predict" || requestUrl.pathname === "/api/insights") {
      const historyPayload = await loadHistory();
      const history = getLastNDaysHistory(historyPayload.rows, 365);
      const fr = safeNumberToken(requestUrl.searchParams.get("fr"));
      const sr = safeNumberToken(requestUrl.searchParams.get("sr"));
      const customSeed =
        /^\d{2}$/.test(fr || "") && /^\d{2}$/.test(sr || "")
          ? { date: "Manual entry", firstRound: fr, secondRound: sr }
          : null;

      jsonResponse(response, 200, calculatePrediction(history, customSeed));
      return;
    }

    serveStatic(requestUrl.pathname, response);
  } catch (error) {
    jsonResponse(response, 500, {
      error: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Shillong Teer dashboard running at http://localhost:${PORT}`);
});
