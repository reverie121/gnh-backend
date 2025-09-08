// bgg-api/getBGGCollectionData.js
'use strict';

const getCollectionData = require('./getGameData');
const { redisClient, redisAvailable, inMemoryCache } = require('../utils/redis');

const CACHE_TTL_SECONDS = 3600;

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase();
}

async function getFromCache(key) {
  if (!redisAvailable) return inMemoryCache.get(key) ?? null;
  try {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`getBGGCollectionData: Redis GET failed (${key}): ${err.message}`);
    return inMemoryCache.get(key) ?? null; // graceful fallback
  }
}

async function setCache(key, value) {
  if (!redisAvailable) {
    inMemoryCache.set(key, value, CACHE_TTL_SECONDS);
    return;
  }
  try {
    await redisClient.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch (err) {
    console.error(`getBGGCollectionData: Redis SETEX failed (${key}): ${err.message}`);
    inMemoryCache.set(key, value, CACHE_TTL_SECONDS); // graceful fallback
  }
}

async function getBGGCollectionData(bggUsername) {
  const uname = normalizeUsername(bggUsername);
  const cacheKey = `collection-${uname}`;

  console.log(`getBGGCollectionData: cache lookup for ${uname} (redisAvailable=${redisAvailable})`);
  const cached = await getFromCache(cacheKey);
  if (cached) {
    console.log(`getBGGCollectionData: hit for ${uname}`);
    return cached;
  }

  console.log(`getBGGCollectionData: miss for ${uname}; fetching from BGG`);
  let userGames;
  try {
    // be explicit about mode to avoid future regressions
    userGames = await getCollectionData(uname, 'collection');
  } catch (err) {
    console.error(`getBGGCollectionData: fetch failed for ${uname}: ${err.message}`);
    throw err;
  }

  await setCache(cacheKey, userGames);
  console.log(`getBGGCollectionData: cached result for ${uname}`);

  return userGames;
}

module.exports = getBGGCollectionData;
