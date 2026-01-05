const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const adminNoticesRoute = require("./routes/adminNotices");
const cron = require("node-cron");
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
app.use("/uploads", express.static("uploads"));



let isConneted = false
async function connectToDatabase() {
  if (isConneted) return;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConneted = true;
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error:", err.message);

  }
}

// middleware
app.use((req, res, next) => {
  if (!isConneted) {
    connectToDatabase()
  }
  next()
})

/* ===============================
   DATABASE CONNECTION
================================ */
// mongoose
//   .connect(process.env.MONGO_URI, {
//     autoIndex: true
//   })
//   .then(() => {
//     console.log("✅ MongoDB connected");
//   })
//   .catch((err) => {
//     console.error("❌ MongoDB connection error:", err.message);
//     process.exit(1);
//   });

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

const startDailyTaskResetJob = require("./jobs/dailyTaskReset");
startDailyTaskResetJob();


cron.schedule(
  "0 0 * * *",
  async () => {
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
    console.log("✅ Daily tasks auto reset (Asia/Dhaka)");
  },
  { timezone: "Asia/Dhaka" }
);

/* ===============================
   SERVER START
================================ */
// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });

module.exports = app;