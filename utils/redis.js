// redis.js

const redis = require("redis");
const { REDIS_URL } = require("../config");

let redisClient = redis.createClient({ url: REDIS_URL }); // Initialize here
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const initialReconnectDelay = 1000;
let currentReconnectDelay = initialReconnectDelay;

async function connectRedis() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Attempting to connect to Redis...");

      redisClient.on("error", (err) => {
        console.log("Redis Error event triggered");
        reconnect();
        reject(err);
      });

      redisClient.on("connect", () => {
        console.log("Redis connect event triggered");
        console.log("Redis Connected".green);
        reconnectAttempts = 0;
        currentReconnectDelay = initialReconnectDelay;
      });

      redisClient.on("ready", () => {
        console.log("Initial Redis Connection Successful!".green);
        resolve();
      });

      redisClient.on("reconnecting", () => {
        console.log("Redis Reconnecting...".yellow);
      });

      await redisClient.connect();
    } catch (error) {
      console.error("Initial Redis Connection Error:", error);
      console.error(error);
      reconnect();
      reject(error);
    }
  });
}

async function reconnect() {
  console.log("reconnect called");
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    console.log(`Attempting Redis reconnect in ${currentReconnectDelay / 1000} seconds... (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`.yellow);
    await new Promise((resolve) =>
      setTimeout(async () => {
        await connectRedis();
        resolve();
      }, currentReconnectDelay)
    );
    currentReconnectDelay *= 2;
  } else {
    console.error("Max Redis reconnect attempts reached. Redis unavailable.".red);
  }
}

module.exports = { connectRedis, redisClient };