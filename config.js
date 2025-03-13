"use strict";

require("dotenv").config();
require("colors");
const { Pool } = require("pg");

const SECRET_KEY = process.env.SECRET_KEY || "secret-dev";
const PORT = +process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const BCRYPT_WORK_FACTOR = process.env.NODE_ENV === "test" ? 1 : 12;

function getDatabaseUri() {
    return process.env.NODE_ENV === "test"
        ? "postgresql:///gnh_test"
        : process.env.DATABASE_URL || "postgresql:///gnh";
}

const db = new Pool({ connectionString: getDatabaseUri() });
db.connect()
    .then(() => console.log("Database connection successful!".green))
    .catch((err) => console.error("Database connection failed:".red, err));

console.log("GNH Config:".green);
console.log("PORT:".yellow, PORT);
console.log("BCRYPT_WORK_FACTOR".yellow, BCRYPT_WORK_FACTOR);
console.log("Database:".yellow, getDatabaseUri());
console.log("---");

module.exports = {
    SECRET_KEY,
    PORT,
    REDIS_URL,
    BCRYPT_WORK_FACTOR,
    getDatabaseUri
};