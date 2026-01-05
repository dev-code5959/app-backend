const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const adminNoticesRoute = require("./routes/adminNotices");
const User = require("./models/User");
const Settings = require("./models/Settings");

// Load environment variables
dotenv.config();

const app = express();

/* ===============================
   GLOBAL MIDDLEWARE
================================ */

app.use(cors({
  origin: "http://easyearnpro.online",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"]
}));

// Optional (only if you still get preflight issues)
app.options(/.*/, cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
// Note: uploads directory content will not persist in Vercel serverless functions
app.use("/uploads", express.static("uploads"));


let isConnected = false;
async function connectToDatabase() {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(process.env.MONGO_URI);
    isConnected = db.connections[0].readyState;
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    throw error; // Propagate error so middleware can handle it
  }
}

// Database Connection Middleware
// Ensures DB is connected before handling any request
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed",
      error: error.message
    });
  }
});

/* ===============================
   ROUTES
================================ */

// Health check
app.get("/api/ping", (req, res) => {
  res.status(200).send("API IS RUNNING");
});

// Auth routes
app.use("/api/auth", require("./routes/auth"));

// User routes
app.use("/api/user", require("./routes/user"));

// Admin routes
app.use("/api/admin", require("./routes/admin"));

// Packages routes
app.use("/api/packages", require("./routes/packageRoutes"));
app.use("/api/admin/notices", adminNoticesRoute);

/* ===============================
   CRON JOBS (Vercel Compatible)
================================ */
// Vercel uses HTTP requests to trigger cron jobs. 
// This endpoint correlates to the reset logic.
app.get("/api/cron/daily-reset", async (req, res) => {
  // secure this endpoint if needed, e.g., check for a secret header
  try {
    await User.updateMany(
      {},
      {
        $set: {
          "tasks.completedToday": 0,
          "tasks.completedTaskIds": [],
          "tasks.lastReset": new Date(),
        },
      }
    );

    const settings = await Settings.findOne();
    if (settings) {
      settings.lastResetAt = new Date();
      await settings.save();
    }
    console.log("✅ Daily tasks auto reset executed");
    res.status(200).json({ success: true, message: "Daily tasks reset" });
  } catch (error) {
    console.error("❌ Daily reset error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/* ===============================
   404 HANDLER
================================ */
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

/* ===============================
   GLOBAL ERROR HANDLER
================================ */
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err.stack);

  res.status(err.status || 500).json({
    message: err.message || "Internal server error"
  });
});

/* ===============================
   SERVER START
================================ */
// Only listen if the file is run directly (not imported by Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    await connectToDatabase();
  });
}

module.exports = app;