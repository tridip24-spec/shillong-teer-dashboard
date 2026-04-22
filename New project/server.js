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
const SUPPLEMENTAL_HISTORY_URL = "https://shillongteergrounds.in/";
const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

function parseSupplementalHistoryPage(html) {
  const rows = [];
  const rowPattern = /<tr><td>(\d{2}\.\d{2}\.\d{4})<\/td><td>([A-Z0-9]{2,3})<\/td><td>([A-Z0-9]{2,3})<\/td><\/tr>/g;

  for (const match of html.matchAll(rowPattern)) {
    const sourceDate = match[1];
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

function isCacheFresh(cacheValue, ttlMs) {
  if (!cacheValue?.fetchedAt) return false;
  const fetchedAt = new Date(cacheValue.fetchedAt).getTime();
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < ttlMs;
}

function mergeHistoryRows(primaryRows, supplementalRows) {
  const merged = new Map();

  for (const row of [...supplementalRows, ...primaryRows]) {
    if (!row?.isoDate) continue;
    merged.set(row.isoDate, row);
  }

  return [...merged.values()].sort((a, b) => b.isoDate.localeCompare(a.isoDate));
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
    const rows = mergeHistoryRows(archiveRows, supplementalRows);
    const payload = {
      fetchedAt: new Date().toISOString(),
      sourceUrl: `${HISTORY_URL} + ${SUPPLEMENTAL_HISTORY_URL}`,
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
  if (!forceRefresh && cached?.date && isCacheFresh(cached, LIVE_CACHE_TTL_MS)) {
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

function sumDigitToken(token) {
  if (!/^\d{2}$/.test(token)) return null;
  return Number(token[0]) + Number(token[1]);
}

function buildWindow(rows, start, length) {
  return rows.slice(start, start + length);
}

function scoreCounterRows(rows, weight, houseScores, endingScores, directScores) {
  for (const row of rows) {
    for (const token of [row.firstRound, row.secondRound]) {
      const digits = getDigits(token);
      if (!digits) continue;
      addWeighted(houseScores, digits.house, weight);
      addWeighted(endingScores, digits.ending, weight);
      addWeighted(directScores, digits.direct, weight);
    }
  }
}

function getTransitionKey(row) {
  if (!row) return null;
  return `${row.firstRound}-${row.secondRound}`;
}

function buildTransitionModel(rows) {
  const directNext = new Map();
  const houseNext = new Map();
  const endingNext = new Map();

  for (let index = 0; index < rows.length - 1; index += 1) {
    const newer = rows[index];
    const older = rows[index + 1];
    const olderKey = getTransitionKey(older);
    if (!olderKey) continue;

    const directMap = directNext.get(olderKey) || new Map();
    const houseMap = houseNext.get(olderKey) || new Map();
    const endingMap = endingNext.get(olderKey) || new Map();

    for (const token of [newer.firstRound, newer.secondRound]) {
      const digits = getDigits(token);
      if (!digits) continue;
      addWeighted(directMap, digits.direct, 1);
      addWeighted(houseMap, digits.house, 1);
      addWeighted(endingMap, digits.ending, 1);
    }

    directNext.set(olderKey, directMap);
    houseNext.set(olderKey, houseMap);
    endingNext.set(olderKey, endingMap);
  }

  return { directNext, houseNext, endingNext };
}

function calculateShiftRanking(currentRows, previousRows, tokenSelector) {
  const currentMap = new Map();
  const previousMap = new Map();

  for (const row of currentRows) {
    for (const token of tokenSelector(row)) {
      addWeighted(currentMap, token, 1);
    }
  }

  for (const row of previousRows) {
    for (const token of tokenSelector(row)) {
      addWeighted(previousMap, token, 1);
    }
  }

  const allKeys = new Set([...currentMap.keys(), ...previousMap.keys()]);

  return [...allKeys]
    .map((key) => ({
      value: /^\d+$/.test(String(key)) ? Number(key) : key,
      shift: (currentMap.get(key) || 0) - (previousMap.get(key) || 0),
      current: currentMap.get(key) || 0,
      previous: previousMap.get(key) || 0,
    }))
    .sort((a, b) => b.shift - a.shift || b.current - a.current || String(a.value).localeCompare(String(b.value)));
}

function calculatePrediction(historyRows, customSeed) {
  const usable = historyRows.filter(
    (row) => /^\d{2}$/.test(row.firstRound) && /^\d{2}$/.test(row.secondRound)
  );
  const recent7 = buildWindow(usable, 0, 7);
  const previous7 = buildWindow(usable, 7, 7);
  const recent15 = buildWindow(usable, 0, 15);
  const recent30 = buildWindow(usable, 0, 30);
  const season90 = buildWindow(usable, 0, 90);
  const year365 = buildWindow(usable, 0, 365);

  const houseScores = weightedCounter();
  const endingScores = weightedCounter();
  const directScores = weightedCounter();
  const pairScores = weightedCounter();
  const transitionScores = weightedCounter();
  const { directNext, houseNext, endingNext } = buildTransitionModel(usable);

  scoreCounterRows(recent7, 6, houseScores, endingScores, directScores);
  scoreCounterRows(recent15, 4, houseScores, endingScores, directScores);
  scoreCounterRows(recent30, 3, houseScores, endingScores, directScores);
  scoreCounterRows(season90, 2, houseScores, endingScores, directScores);
  scoreCounterRows(year365, 1, houseScores, endingScores, directScores);

  for (const row of recent30) {
    const pairA = `${row.firstRound[0]}${row.secondRound[0]}`;
    const pairB = `${row.firstRound[1]}${row.secondRound[1]}`;
    addWeighted(pairScores, pairA, 2);
    addWeighted(pairScores, pairB, 2);

    const sumShift = (sumDigitToken(row.firstRound) + sumDigitToken(row.secondRound)) % 10;
    addWeighted(endingScores, sumShift, 4);
    addWeighted(endingScores, (sumShift + 1) % 10, 2);
    addWeighted(endingScores, (sumShift + 9) % 10, 2);
  }

  const latest = customSeed || usable[0];
  const latestKey = getTransitionKey(latest);

  if (latestKey && directNext.has(latestKey)) {
    for (const [value, score] of directNext.get(latestKey).entries()) {
      addWeighted(directScores, value, score * 6);
      addWeighted(transitionScores, value, score * 6);
    }
  }

  if (latestKey && houseNext.has(latestKey)) {
    for (const [value, score] of houseNext.get(latestKey).entries()) {
      addWeighted(houseScores, value, score * 5);
    }
  }

  if (latestKey && endingNext.has(latestKey)) {
    for (const [value, score] of endingNext.get(latestKey).entries()) {
      addWeighted(endingScores, value, score * 5);
    }
  }

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
  })).slice(0, 10);

  const risingHouses = calculateShiftRanking(
    recent7,
    previous7,
    (row) => [row.firstRound[0], row.secondRound[0]]
  ).slice(0, 4);

  const risingEndings = calculateShiftRanking(
    recent7,
    previous7,
    (row) => [row.firstRound[1], row.secondRound[1]]
  ).slice(0, 5);

  const candidateMap = new Map();

  function addCandidate(value, score, reason) {
    const current = candidateMap.get(value) || { value, score: 0, reasons: [] };
    current.score += score;
    if (!current.reasons.includes(reason)) {
      current.reasons.push(reason);
    }
    candidateMap.set(value, current);
  }

  for (const house of topHouses.slice(0, 4)) {
    for (const ending of topEndings.slice(0, 4)) {
      addCandidate(`${house.value}${ending.value}`, house.score + ending.score, "House + ending momentum");
    }
  }

  for (const direct of topDirect.slice(0, 6)) {
    addCandidate(direct.value, direct.score * 1.3, "Direct recurrence");
  }

  for (const [pairValue, score] of pairScores.entries()) {
    const first = pairValue[0];
    const second = pairValue[1];
    addCandidate(`${first}${second}`, score * 1.1, "Shift pair pattern");
  }

  for (const [value, score] of transitionScores.entries()) {
    addCandidate(value, score * 1.4, "Previous-day transition");
  }

  const possibleNumbers = [...candidateMap.values()]
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, 12)
    .map((item, index) => ({
      value: item.value,
      score: Number(item.score.toFixed(1)),
      confidence: index < 4 ? "higher" : index < 8 ? "medium" : "watch",
      reason: item.reasons.slice(0, 2).join(" + "),
    }));

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
    possibleNumbers,
    commonNumbers: possibleNumbers.map((item) => ({
      value: item.value,
      reason: item.reason,
    })),
    shiftSummary: {
      risingHouses,
      risingEndings,
    },
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
  const recentDirect = new Map();
  const monthlyTrend = new Map();

  for (const [index, row] of usable.entries()) {
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
      if (index < 21) {
        addWeighted(recentDirect, digits.direct, 1);
      }
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

  const recentShiftNumbers = rankMap(recentDirect, (value, score) => ({
    value,
    count: score,
  })).slice(0, 10);

  const currentRows = buildWindow(usable, 0, 14);
  const previousRows = buildWindow(usable, 14, 14);
  const risingHouses = calculateShiftRanking(
    currentRows,
    previousRows,
    (row) => [row.firstRound[0], row.secondRound[0]]
  ).slice(0, 5);
  const risingEndings = calculateShiftRanking(
    currentRows,
    previousRows,
    (row) => [row.firstRound[1], row.secondRound[1]]
  ).slice(0, 5);

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
    recentShiftNumbers,
    risingHouses,
    risingEndings,
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
