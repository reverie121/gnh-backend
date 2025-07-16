"use strict";

require("dotenv").config();
require("colors");
const { Pool } = require("pg");

const SECRET_KEY = process.env.SECRET_KEY || "secret-dev";
const PORT = +process.env.PORT || 3001;
const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false"; // Enable Redis by default unless explicitly disabled
const REDIS_URL = process.env.REDIS_URL || 
                 (process.env.NODE_ENV === "production" 
                   ? "/home/outstan3/.redis/redis.sock" 
                   : "redis://127.0.0.1:6379");
const BCRYPT_WORK_FACTOR = process.env.NODE_ENV === "test" ? 1 : 12;

function getDatabaseUri() {
    return process.env.NODE_ENV === "test"
        ? "postgresql:///gnh_test"
        : process.env.DATABASE_URL || "postgresql:///gnh";
}

const poolOptions = {
    connectionString: getDatabaseUri(),
    // Enable SSL in production if required by the hosting provider
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
};

const db = new Pool(poolOptions);
db.connect()
    .then(() => console.log("Database connection successful!".green))
    .catch((err) => {
        console.error("Database connection failed:".red, err);
        // Optionally exit in production if the database is critical
        if (process.env.NODE_ENV === "production") {
            console.error("Exiting due to critical database connection failure.".red);
            process.exit(1);
        }
    });

console.log("GNH Config:".green);
console.log("PORT:".yellow, PORT);
console.log("REDIS_ENABLED:".yellow, REDIS_ENABLED);
console.log("BCRYPT_WORK_FACTOR".yellow, BCRYPT_WORK_FACTOR);
console.log("REDIS_URL:".yellow, REDIS_URL); // Added for debugging
console.log("Database:".yellow, getDatabaseUri());
console.log("---");

module.exports = {
    SECRET_KEY,
    PORT,
    REDIS_ENABLED,
    REDIS_URL,
    BCRYPT_WORK_FACTOR,
    getDatabaseUri,
    db // Export the pool for use in other modules
};