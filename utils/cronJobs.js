const cron = require('node-cron');
const { User } = require("./models/User");
const mongoose = require("mongoose");

// Connect to your MongoDB
mongoose.connect('mongodb+srv://asifdatabase:asif1234@cluster0.hteslvn.mongodb.net/newapp?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true });

// server/jobs/dailyReset.js

function startDailyResetJob() {
  // Every day at 00:00 (midnight) Dhaka time
  cron.schedule(
    "0 0 * * *",
    async () => {
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
        console.log("✅ Daily tasks reset (Asia/Dhaka)");
      } catch (e) {
        console.error("❌ Daily reset failed:", e);
      }
    },
    { timezone: "Asia/Dhaka" }
  );
}

module.exports = { startDailyResetJob };

