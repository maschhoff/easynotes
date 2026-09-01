// Simple JSON settings store persisted to data/settings.json
import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

let _file = null;
let _cache = null;

// Server-side lock session (opaque token -> expiry). A browser may only access
// protected endpoints once it holds a token that was issued after a successful
// PIN verification. This closes the client-side-only lock bypass (e.g. direct
// calls to /api/note/pdf without entering the PIN).
const _sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// Internal signing secret. Used to set an HttpOnly cookie so the token is not
// readable from JS and survives a page reload. Falls back to an ephemeral value
// if the env var is not set (sessions reset on restart).
let _secret = process.env.EASYNOTES_SECRET || '';

export function getSecret() {
  if (!_secret) {
    _secret = randomBytes(32).toString('hex');
  }
  return _secret;
}

export function initSettings(dataDir) {
  _file = path.join(dataDir, 'settings.json');
  if (!fs.existsSync(_file)) {
    fs.writeFileSync(_file, JSON.stringify(defaultSettings(), null, 2), 'utf8');
  }
  _cache = JSON.parse(fs.readFileSync(_file, 'utf8'));
  return _cache;
}

// Remove expired sessions (called opportunistically).
export function pruneSessions() {
  const now = Date.now();
  for (const [tok, exp] of _sessions) {
    if (exp < now) _sessions.delete(tok);
  }
}

// Create a fresh session token after a successful PIN entry.
export function createSession() {
  pruneSessions();
  const tok = randomBytes(32).toString('hex');
  _sessions.set(tok, Date.now() + SESSION_TTL_MS);
  return tok;
}

// Validate an issuer token. Returns true if it names a live session.
export function isValidSession(token) {
  if (!token) return false;
  pruneSessions();
  const exp = _sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    _sessions.delete(token);
    return false;
  }
  return true;
}

// Invalidate a session (logout).
export function destroySession(token) {
  if (token) _sessions.delete(token);
}

export function defaultSettings() {
  return {
    lang: 'de',
    theme: 'light',
    tagsEnabled: true,
    versionHistory: 3,   // Anzahl der aufzubewahrenden MD-Versionen (0 = deaktiviert)
    startPage: 'pinboard', // 'pinboard' | 'welcome' | 'tree'
    pinHash: '', // SHA-256 hex of the lock PIN; empty = unlocked
    favorites: [], // array of note paths (Favoriten)
    pinned: [],    // array of note paths (angepinnte Notizen für die Pinnwand)
    ai: {
      deepseek: { apiKey: '', model: 'deepseek-chat' },
      claude: { apiKey: '', model: 'claude-3-5-sonnet-20241022' },
      openai: { apiKey: '', model: 'gpt-4o-mini' }
    }
  };
}

export function getSettings() {
  if (!_cache) return defaultSettings();
  return _cache;
}

export function hashPin(pin) {
  return createHash('sha256').update(String(pin || '')).digest('hex');
}

export function verifyPin(pin) {
  const s = getSettings();
  if (!s.pinHash) return true; // no PIN set = always unlocked
  return hashPin(pin) === s.pinHash;
}

export function updateSettings(patch) {
  const cur = getSettings();
  const next = deepMerge(cur, patch || {});
  // PIN handling: client sends { pin, currentPin, clearPin }
  if (patch && typeof patch === 'object') {
    if (patch.clearPin) {
      next.pinHash = '';
    } else if (patch.pin !== undefined) {
      // Setting/removing a PIN requires the current PIN (or none set yet)
      const curPinOk = !cur.pinHash || hashPin(patch.currentPin) === cur.pinHash;
      const newPin = String(patch.pin || '').trim();
      if (curPinOk) {
        next.pinHash = newPin ? hashPin(newPin) : '';
      }
    }
  }
  _cache = next;
  if (_file) fs.writeFileSync(_file, JSON.stringify(next, null, 2), 'utf8');
  return getSettings();
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? base : patch;
  if (typeof base === 'object' && base && typeof patch === 'object' && patch) {
    const out = { ...base };
    for (const k of Object.keys(patch)) {
      out[k] = deepMerge(base[k], patch[k]);
    }
    return out;
  }
  return patch === undefined ? base : patch;
}
