const cron = require("node-cron");
const User = require("../models/User");

function startDailyTaskResetJob() {
  // Runs every day at 00:00
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("--- SYSTEM: STARTING AUTOMATIC DAILY TASK RESET ---");

      await User.updateMany(
        {},
        {
          $set: {
            "tasks.completedToday": 0,
            "tasks.lastReset": new Date(),
          },
        }
      );

      console.log("--- SYSTEM: DAILY RESET COMPLETED ---");
    } catch (error) {
      console.error("CRON ERROR:", error);
    }
  });
}

module.exports = startDailyTaskResetJob;
