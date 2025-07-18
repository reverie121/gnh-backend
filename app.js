// app.js

const express = require("express");
const cors = require("cors");
const fs = require('fs');
const { NotFoundError } = require("./expressError");
const { authenticateJWT } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const bggRoutes = require("./routes/bgg");
const quickFilterRoutes = require("./routes/quickFilters");
const morgan = require("morgan");
const { connectRedis, redisAvailable, inMemoryCache } = require("./utils/redis");

function writeLog(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync('/home/outstan3/server.gamenighthelper.outstandingcode.com/app_debug.log', `${timestamp} - ${message}\n`, 'utf8');
}
const { REDIS_ENABLED, CLIENT_ORIGIN, dbConfig } = require("./config");

writeLog("APP START: Application `app.js` is beginning execution.");
writeLog(`APP START: process.env.NODE_ENV = ${process.env.NODE_ENV}`);
writeLog(`APP START: CLIENT_ORIGIN (from config) = ${CLIENT_ORIGIN}`);
writeLog(`APP START: process.env.PGSSLMODE = ${process.env.PGSSLMODE}`);
writeLog(`APP START: Configured DB SSL Setting for Pool Options: ${dbConfig.ssl}`); // Confirm config's understanding


const app = express();

console.log("Server starting...");
writeLog("APP LOG: Server starting console.log encountered.");

console.log("Loading Middleware...");
writeLog("APP LOG: Loading Middleware console.log encountered.");
app.use(cors({
  origin: CLIENT_ORIGIN,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(morgan("tiny"));
app.use(authenticateJWT);

app.get('/test-cors', (req, res) => {
  console.log("TEST-CORS route hit!");
  return res.json({ message: "CORS test successful!" });
});

console.log("Loading Routes...");
app.get('/test', (req, res) => {
  console.log("Test route hit!");
  return res.send('Test route working!');
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/bgg", bggRoutes);
app.use("/quick-filters", quickFilterRoutes);

console.log("Loading Error Handlers...");
app.use(function (req, res, next) {
  return next(new NotFoundError());
});

app.use(function (err, req, res, next) {
  if (process.env.NODE_ENV !== "test") console.error(err);
  const status = err.status || 500;
  const message = err.message;

  return res.status(status).json({
    error: { message, status },
  });
});

const PORT = process.env.PORT || 30010;

// Start the server immediately
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`.green);
  writeLog(`APP LOG: Server successfully listening on port ${PORT}.`);
});

// Attempt Redis connection separately
if (REDIS_ENABLED) {
  (async () => {
    try {
      const isRedisConnected = await connectRedis(); // Capture the boolean result
      console.log("Redis is fully ready:".green, isRedisConnected); // Log the result
    } catch (err) {
      console.error("Failed to connect to Redis:".red, err.message);
      if (process.env.NODE_ENV !== "test") console.error(err);
      console.log("Continuing with in-memory cache.".yellow);
    }
  })();
} else {
  console.log("Redis connection skipped: REDIS_ENABLED is false".yellow);
  console.log("Redis is fully ready:".green, false); // This is still correct here
}

// Endpoint to check Redis readiness
app.get('/redis-ready', (req, res) => {
  res.json({ ready: redisAvailable, redisEnabled: REDIS_ENABLED, usingInMemoryCache: !REDIS_ENABLED || !redisAvailable });
});

module.exports = app;