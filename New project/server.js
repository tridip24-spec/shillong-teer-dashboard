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
const LIVE_CACHE_TTL_MS = 60 * 1000;
const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;
const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;
const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 1200;

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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

let refreshInProgress = false;
let lastRefreshError = null;
let lastSuccessfulRefresh = null;

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
