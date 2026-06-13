import { readStoredAuth } from "./authStorage";

const CACHE_VERSION = "v1";
const CACHE_PREFIX = `trader-cache:${CACHE_VERSION}`;

function getNamespace() {
  const auth = readStoredAuth();
  const userId = auth?.user?.id || "anonymous";
  const accountScope = auth?.user?.activeAccountScope || "SIMULATOR";

  return `${CACHE_PREFIX}:${userId}:${accountScope}`;
}

function hasStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function readPersistentCache(key, ttlMs) {
  if (!hasStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${getNamespace()}:${key}`);

    if (!raw) {
      return null;
    }

    const entry = JSON.parse(raw);

    if (!entry || Date.now() - entry.createdAt > ttlMs) {
      window.localStorage.removeItem(`${getNamespace()}:${key}`);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function writePersistentCache(key, data) {
  if (!hasStorage()) {
    return data;
  }

  try {
    window.localStorage.setItem(
      `${getNamespace()}:${key}`,
      JSON.stringify({
        createdAt: Date.now(),
        data
      })
    );
  } catch {
    // Storage can be full or disabled. In-memory caches still keep the app usable.
  }

  return data;
}

export function removePersistentCache(key) {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(`${getNamespace()}:${key}`);
  } catch {
    // Ignore storage failures; callers also clear memory caches.
  }
}

export function clearPersistentCacheGroup(group) {
  if (!hasStorage()) {
    return;
  }

  try {
    const groupPrefix = `${CACHE_PREFIX}:`;
    const keysToRemove = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(groupPrefix) && key.includes(`:${group}:`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage failures; callers also clear memory caches.
  }
}
