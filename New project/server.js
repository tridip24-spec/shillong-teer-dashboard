// name=New project/server.js
// Production-ready server with background refresh, retries, and async-safety.
// IMPORTANT: Replace the fetchAndBuildCache() placeholder implementation below
// with your existing fetching/parsing/prediction logic. Do NOT remove any of
// your existing API endpoints — paste them into the "EXISTING API ENDPOINTS"
// section below if necessary.

const express = require('express');
const process = require('process');
const fetch = global.fetch || require('node-fetch'); // Node 18+ has global fetch; fallback to node-fetch
const AbortController = global.AbortController || require('abort-controller');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration (override via env)
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS) || 5 * 60 * 1000; // default 5m
const INITIAL_DELAY_MS = Number(process.env.INITIAL_DELAY_MS) || 0; // delay before first automatic refresh
const REFRESH_TIMEOUT_MS = Number(process.env.REFRESH_TIMEOUT_MS) || 20 * 1000; // timeout per fetch attempt
const MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3;
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS) || 1000; // base backoff
const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS) || 30 * 1000;

// Simple in-memory cache — keep this; your endpoints can read from it
const cache = {
  data: null,
  updatedAt: null,
  lastError: null,
  isStale: true
};

// A lock/promise to ensure only one refresh runs at a time.
// refreshLock will point to the active refresh Promise or null.
let refreshLock = null;

// Utility: sleep for ms
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Exponential backoff with jitter
function backoffMs(attempt) {
  const base = RETRY_BASE_MS * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * (base / 2));
  return Math.min(base + jitter, MAX_BACKOFF_MS);
}

// Helper: fetch with timeout using AbortController
async function fetchWithTimeout(url, options = {}, timeoutMs = REFRESH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/*
  === PASTE YOUR EXISTING FETCH / PARSING / PREDICTION LOGIC HERE ===

  Replace the async function below with your original logic that fetches the
  upstream data, parses it, runs predictions, and returns the value you want
  stored in cache.data.

  The function must:
   - be async
   - return an object (or value) that will be assigned to cache.data
   - throw on error when fetch/parsing fails so the retry logic can pick it up

  Example placeholder:

    async function fetchAndBuildCache() {
      // Your original code:
      // const raw = await fetch('https://source.example/data');
      // const parsed = parse(raw);
      // const prediction = runPrediction(parsed);
      // return { parsed, prediction };
    }

  Do NOT change the function name unless you also update calls below.
*/

async function fetchAndBuildCache() {
  // PLACEHOLDER: Minimal example showing how to use fetchWithTimeout.
  // REMOVE this and paste your existing logic here.
  // This placeholder returns an example object — replace it.

  // Example fetch usage (adjust or remove)
  // const res = await fetchWithTimeout('https://example.com/data.json', {}, REFRESH_TIMEOUT_MS);
  // if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  // const json = await res.json();

  // Example transformation / prediction
  // const prediction = { sample: true };

  // return { json, prediction };

  throw new Error('fetchAndBuildCache() is a placeholder: replace this with your real fetch / parse / prediction logic.');
}

/*
  === END PLACEHOLDER ===
*/

// Core refresh function (single attempt)
async function doRefreshOnce() {
  // call user-provided fetchAndBuildCache which must throw on failure
  const newData = await fetchAndBuildCache();
  // Update cache atomically
  cache.data = newData;
  cache.updatedAt = new Date().toISOString();
  cache.lastError = null;
  cache.isStale = false;
  console.info(`[cache] updated at ${cache.updatedAt}`);
  return cache;
}

// Wrapper that runs refresh with retries and updates cache.lastError on failure.
// Ensures that callers can await the same refresh if a refresh is already running.
async function refreshWithRetries() {
  // If a refresh is already in progress, return the same Promise
  if (refreshLock) {
    return refreshLock;
  }

  // Create a refresh Promise and assign to lock
  refreshLock = (async () => {
    let attempt = 0;
    let lastErr = null;

    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        const result = await doRefreshOnce();
        refreshLock = null; // release lock on success
        return result;
      } catch (err) {
        lastErr = err;
        console.warn(`[cache][attempt ${attempt}] refresh failed: ${err && err.message ? err.message : err}.`);
        if (attempt < MAX_RETRIES) {
          const waitMs = backoffMs(attempt);
          console.info(`[cache] retrying in ${waitMs}ms (attempt ${attempt + 1} of ${MAX_RETRIES})`);
          await sleep(waitMs);
        } else {
          // Exhausted attempts
          const now = new Date().toISOString();
          cache.lastError = {
            message: lastErr && lastErr.message ? lastErr.message : String(lastErr),
            attempt,
            timestamp: now
          };
          cache.isStale = true;
          console.error(`[cache] refresh failed after ${attempt} attempts: ${cache.lastError.message}`);
        }
      }
    }

    refreshLock = null;
    // Rethrow the last error so callers can see failure if they awaited refreshWithRetries()
    throw lastErr;
  })();

  return refreshLock;
}

// Public function to request a refresh (returns Promise)
function requestRefresh() {
  return refreshWithRetries().catch(err => {
    // swallow / log the error here; the cache.lastError preserves details
    console.error(`[cache] manual refresh error: ${err && err.message ? err.message : err}`);
    throw err;
  });
}

// Background scheduler: start auto-refresh with setInterval, safe against overlapping calls.
// We start a timer but ensure we don't run overlapping refreshes because refreshWithRetries uses a lock.
let backgroundInterval = null;
function startBackgroundRefresh() {
  // do not start multiple intervals
  if (backgroundInterval) return;

  // schedule first run after INITIAL_DELAY_MS (so app startup can finish)
  setTimeout(() => {
    // run first refresh immediately (and subsequent ones via interval)
    requestRefresh().catch(err => {
      // already logged; keep going
    });

    // schedule recurring refreshes
    backgroundInterval = setInterval(() => {
      // Trigger a refresh but don't crash the server if it throws
      requestRefresh().catch(err => {
        // already logged
      });
    }, REFRESH_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.info(`[cache] background refresh scheduled every ${REFRESH_INTERVAL_MS}ms (initial delay ${INITIAL_DELAY_MS}ms)`);
}

function stopBackgroundRefresh() {
  if (backgroundInterval) {
    clearInterval(backgroundInterval);
    backgroundInterval = null;
  }
}

/*
  === EXISTING API ENDPOINTS ===
  Keep any existing endpoints that you already have.
  You can paste your endpoints below or keep them in-place in your original file.

  The following endpoints are added:
   - GET /__refresh  -> triggers manual refresh (returns cache and result)
   - GET /__health   -> simple liveness/health
   - GET /__cache    -> returns cache metadata and data (JSON). Useful for debugging.
  Make sure these do not conflict with your existing endpoints. If they do, rename or remove them.
*/

// Health endpoint
app.get('/__health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    now: new Date().toISOString()
  });
});

// Manual refresh trigger (safe)
app.get('/__refresh', async (req, res) => {
  try {
    await requestRefresh();
    res.json({
      ok: true,
      cacheUpdatedAt: cache.updatedAt,
      isStale: cache.isStale,
      lastError: cache.lastError
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: 'Refresh failed',
      error: (err && err.message) ? err.message : String(err),
      lastError: cache.lastError
    });
  }
});

// Expose cache for debugging (keep it read-only)
app.get('/__cache', (req, res) => {
  res.json({
    updatedAt: cache.updatedAt,
    isStale: cache.isStale,
    lastError: cache.lastError,
    data: cache.data
  });
});

/*
  === YOUR APPLICATION ENDPOINTS SHOULD GO HERE ===

  If your original server.js defines routes like:
    app.get('/api/some', ...)
    app.post('/predict', ...)
  copy/paste them here so they continue to use `cache`.

  Important: If your existing endpoints expect a particular variable name,
  ensure they access the `cache` object above (cache.data, cache.updatedAt, etc.)
*/

// Example: keep this comment as a reminder. Do not remove unless you pasted your endpoints.
/*
app.get('/api/data', (req, res) => {
  // YOUR ORIGINAL HANDLER — ensure it reads `cache.data` or `cache` object
  res.json(cache.data);
});
*/

/*
  === STARTUP ===
  - Run an initial refresh at startup (so Render free-tier cold start has fresh data).
  - Start background refresh interval.
*/

async function startup() {
  // Attempt an initial refresh immediately (with retries). Do not crash the process if it fails.
  try {
    await requestRefresh();
  } catch (err) {
    console.warn('[startup] initial refresh failed; server will start and background refresh will keep trying.', err && err.message ? err.message : err);
  }

  // Start periodic auto-refresh
  startBackgroundRefresh();

  // Start express
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  stopBackgroundRefresh();
  // wait for any ongoing refresh
  if (refreshLock) {
    try {
      await refreshLock;
    } catch (e) {
      // ignore
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Log unhandled errors to avoid silent failures
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Consider exiting if needed; for now log and keep running
});

// Start up
startup();
