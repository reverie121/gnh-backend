// config.js

"use strict";

require("dotenv").config();
require("colors");
const { Pool } = require("pg");
const fs = require('fs');

function writeConfigLog(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync('/home/outstan3/server.gamenighthelper.outstandingcode.com/app_debug.log', `${timestamp} - (Config) ${message}\n`, 'utf8');
}

writeConfigLog("CONFIG LOAD: config.js is being loaded.");

const SECRET_KEY = process.env.SECRET_KEY || "secret-dev";
const PORT = +process.env.PORT || 30010;
const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false"; // Enable Redis by default unless explicitly disabled
const REDIS_URL = process.env.REDIS_URL ||
                 (process.env.NODE_ENV === "production"
                   ? "/home/outstan3/.redis/redis.sock"
                   : "redis://127.0.0.1:6379");
const BCRYPT_WORK_FACTOR = process.env.NODE_ENV === "test" ? 1 : 12;

// --- NEW: Define CLIENT_ORIGIN based on environment ---
const CLIENT_ORIGIN = process.env.NODE_ENV === "production"
                      ? "https://gamenighthelper.outstandingcode.com"
                      : "http://localhost:3000"; // Adjust if your local frontend uses a different port

function getDatabaseUri() {
    return process.env.NODE_ENV === "test"
        ? "postgresql:///gnh_test"
        : process.env.DATABASE_URL || "postgresql:///gnh";
}

const poolOptions = {
    connectionString: getDatabaseUri(),
    // Change this line to explicitly disable SSL for the database connection
    ssl: false
};

writeConfigLog(`CONFIG DB: NODE_ENV (from config): ${process.env.NODE_ENV}`);
writeConfigLog(`CONFIG DB: Database URI: ${getDatabaseUri()}`);
writeConfigLog(`CONFIG DB: SSL Setting for Pool Options: ${JSON.stringify(poolOptions.ssl)}`);

console.log("GNH Config:".green);
console.log("PORT:".yellow, PORT);
console.log("REDIS_ENABLED:".yellow, REDIS_ENABLED);
console.log("BCRYPT_WORK_FACTOR".yellow, BCRYPT_WORK_FACTOR);
console.log("REDIS_URL:".yellow, REDIS_URL); // Added for debugging
console.log("Database:".yellow, getDatabaseUri());
console.log("---");

console.log("DEBUG: config.js - Exporting CLIENT_ORIGIN:", CLIENT_ORIGIN); // Add this
console.log("DEBUG: config.js - Exporting SSL setting:", poolOptions.ssl); // Add this (this is the most important one!)

// config.js (at the very end)

module.exports = {
    SECRET_KEY,
    PORT,
    REDIS_ENABLED,
    REDIS_URL,
    BCRYPT_WORK_FACTOR,
    getDatabaseUri,
    dbConfig: poolOptions, // Export poolOptions as dbConfig for app.js
    CLIENT_ORIGIN
};