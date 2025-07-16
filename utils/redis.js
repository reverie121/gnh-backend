const redis = require("redis");
const { REDIS_URL, REDIS_ENABLED } = require("../config");
const NodeCache = require("node-cache");

// Define constants and variables
let redisClient;
let isConnecting = false; // Track connection attempts to prevent concurrent connects
let pendingReconnect = false; // Track if a reconnect is already scheduled
let reconnectStopped = false; // Flag to stop reconnect attempts after max attempts
let redisAvailable = false; // Tracks if Redis is connected and ready
let reconnectAttempts = 0;
let errorHandler = null; // Initialize errorHandler to null
let reconnectInProgress = false; // Track if reconnect is actively running
let lastErrorTime = 0; // Track time of last error for debouncing
const inMemoryCache = new NodeCache({ stdTTL: 600 }); // 10-minute TTL for in-memory cache
const maxReconnectAttempts = 1; // Reduced to 1 attempt for ~3 seconds total
const initialReconnectDelay = 3000; // 3 seconds for stability
let currentReconnectDelay = initialReconnectDelay;
const errorDebounceMs = 15000; // 15 seconds to handle delayed errors
let suppressErrorLogs = false; // Suppress error logs during reconnect
const connectTimeoutMs = 5000; // 5-second timeout for connect attempts
let reconnectPromise = null; // Track ongoing reconnect promise to serialize attempts

if (REDIS_ENABLED) {
  // Initialize redisClient once at module level
  const isSocket = !REDIS_URL.startsWith("redis://");
  const clientOptions = isSocket 
    ? { socket: { path: REDIS_URL }, disableOfflineQueue: true, maxRetriesPerRequest: 0 }
    : { url: REDIS_URL, disableOfflineQueue: true, maxRetriesPerRequest: 0 };
  redisClient = redis.createClient(clientOptions);
}

// Function to clean up Redis client when max attempts are reached
async function cleanupRedisClient() {
  if (redisClient && errorHandler) {
    redisClient.removeListener("error", errorHandler);
    redisClient.removeAllListeners();
    if (redisClient.isOpen) {
      await redisClient.disconnect().catch(() => {});
    }
    redisClient.isOpen = false; // Force reset isOpen state
  }
  redisClient = null; // Set to null only after all operations
  errorHandler = null;
  console.error("Max Redis reconnect attempts reached. Redis unavailable.".red);
  console.log("Falling back to in-memory cache.".yellow);
  reconnectStopped = true;
  pendingReconnect = false;
  isConnecting = false;
  redisAvailable = false;  
  reconnectInProgress = false;
  lastErrorTime = 0;
  suppressErrorLogs = false;
  reconnectPromise = null; // Clear reconnect promise
}

// Function to connect to Redis with proper error handling and state management
// utils/redis.js

// ... (existing constants and variables) ...

async function connectRedis() {
  if (!REDIS_ENABLED) {
    console.log("Redis is disabled via REDIS_ENABLED=false".yellow);
    redisAvailable = false; // Ensure it's false
    redisClient = {
      // ... in-memory cache mock ...
    };
    return false; // Indicate failure/disabled
  }
  if (reconnectStopped) {
    console.log("Reconnect stopped: Max attempts reached previously".yellow);
    return false; // Indicate failure
  }
  if (isConnecting || reconnectInProgress || reconnectPromise) {
    console.log("Skipping Redis connection attempt: already connecting or reconnecting".yellow);
    // If it's already connecting, wait for it to finish and return its result
    if (reconnectPromise) {
        await reconnectPromise; // Wait for the ongoing reconnect
        return redisAvailable; // Return the final state after reconnect
    }
    // If just isConnecting, assume it will eventually resolve and check redisAvailable
    return redisAvailable;
  }

  isConnecting = true;
  suppressErrorLogs = true;
  console.log("Attempting to connect to Redis with REDIS_URL:", REDIS_URL);

  if (redisClient && errorHandler) {
    redisClient.removeListener("error", errorHandler);
  }

  errorHandler = (err) => {
    const now = Date.now();
    if (!suppressErrorLogs && now - lastErrorTime >= errorDebounceMs) {
      console.error("Redis Error event triggered:", err.message.red);
      if (redisAvailable) {
        console.log("redisAvailable before setting to false:", redisAvailable);
        redisAvailable = false;
        console.log("redisAvailable after setting to false:", redisAvailable);
      }
    }
    lastErrorTime = now;
    if (reconnectStopped || reconnectInProgress || pendingReconnect) {
      return;
    }
    if (reconnectAttempts < maxReconnectAttempts) {
      pendingReconnect = true;
      reconnect().catch(() => {});
    }
  };

  if (redisClient) {
    redisClient.on("error", errorHandler);
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      console.log("Ready event fired");
      redisAvailable = true; // This is where the module-level variable is updated
      isConnecting = false;
      reconnectAttempts = 0;
      currentReconnectDelay = initialReconnectDelay;
      pendingReconnect = false;
      reconnectInProgress = false;
      suppressErrorLogs = false;
      reconnectPromise = null;
      cleanup();
      resolve(true); // Resolve with true for success
    };
    const onConnect = () => {
      console.log("Redis connect event triggered");
      console.log("redisAvailable before setting to true:", redisAvailable);
      redisAvailable = true; // Also set to true on connect
      console.log("redisAvailable after setting to true:", redisAvailable);
    };
    const onError = (err) => {
      console.log("Error event fired:", err.message);
      isConnecting = false;
      redisAvailable = false; // Ensure it's false on error
      suppressErrorLogs = false;
      cleanup();
      reject(err); // Reject the promise on error
    };
    const cleanup = () => {
      if (redisClient) {
        redisClient.removeListener("ready", onReady);
        redisClient.removeListener("connect", onConnect);
        redisClient.removeListener("error", onError);
      }
    };
    if (!redisClient.isOpen) {
      redisClient.on("ready", onReady);
      redisClient.on("connect", onConnect);
      redisClient.on("error", onError);
      redisClient.connect().catch(onError); // Use onError for direct connect errors too
    } else {
      console.log("Redis client already connected".yellow);
      redisAvailable = true;
      isConnecting = false;
      reconnectStopped = false;
      pendingReconnect = false;
      reconnectInProgress = false;
      suppressErrorLogs = false;
      reconnectPromise = null;
      resolve(true); // Resolve with true if already connected
    }
  });
}

// ... (reconnect function - ensure it also returns a boolean or the final redisAvailable state) ...

// Adjust reconnect function to also return a promise that resolves to a boolean
async function reconnect() {
    if (!REDIS_ENABLED || !redisClient || reconnectStopped) {
        // ... existing logic ...
        return false; // Indicate failure to reconnect
    }
    if (reconnectInProgress || reconnectPromise) {
        // Await existing promise and return its result
        return reconnectPromise.then(() => redisAvailable).catch(() => false);
    }
    reconnectPromise = (async () => {
        try {
            if (reconnectAttempts < maxReconnectAttempts) {
                // ... existing logic ...
                await new Promise(resolve => setTimeout(resolve, currentReconnectDelay));
                // ... cleanup and reinitialize redisClient ...
                isConnecting = false; // Reset before attempting connect
                await connectRedis(); // This call will now resolve to a boolean
                reconnectInProgress = false;
                suppressErrorLogs = false;
                return true; // Reconnect successful
            }
        } catch (err) {
            // ... existing error logging ...
            reconnectInProgress = false;
            suppressErrorLogs = false;
            currentReconnectDelay *= 2;
            if (reconnectAttempts < maxReconnectAttempts) {
                return reconnect(); // Queue next attempt, which will return its boolean result
            }
            return false; // Reconnect attempts exhausted
        } finally {
            if (reconnectAttempts >= maxReconnectAttempts) {
                await cleanupRedisClient();
            }
            reconnectPromise = null; // Clear reconnect promise
        }
    })();
    return reconnectPromise; // Return the promise for `await`ing
}

module.exports = { connectRedis, redisClient, redisAvailable, inMemoryCache };