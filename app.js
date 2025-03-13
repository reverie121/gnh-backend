// app.js

const express = require("express");
const cors = require("cors");
const { NotFoundError } = require("./expressError");
const { authenticateJWT } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const bggRoutes = require("./routes/bgg");
const quickFilterRoutes = require("./routes/quickFilters");
const morgan = require("morgan");
const { connectRedis } = require("./utils/redis");

const app = express();

console.log("Server starting...");

console.log("Loading Middleware...");
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));
app.use(authenticateJWT);

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

const PORT = process.env.PORT || 3001;

let redisIsReady = false; // Add readiness flag

// Start the server AFTER Redis connects
connectRedis()
  .then(() => {
    redisIsReady = true; // Set readiness flag
    console.log("Redis is fully ready.");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Server failed to start due to Redis connection error:", err);
    process.exit(1);
  });

app.get('/redis-ready', (req, res) => {
    res.json({ ready: redisIsReady });
});

module.exports = app;