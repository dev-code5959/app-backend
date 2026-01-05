const mongoose = require("mongoose");

const TaskWatchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },

    status: { type: String, enum: ["active", "completed", "expired"], default: "active" },

    requiredSeconds: { type: Number, default: 10 },
    canCompleteAt: { type: Date, required: true },

    // ✅ NEW: track viewing
    startedAt: { type: Date, default: Date.now },
    watchedSeconds: { type: Number, default: 0 },

    // ✅ NEW: track income
    rewardEarned: { type: Number, default: 0 },

    lastHeartbeatAt: { type: Date, default: null },
    heartbeatCount: { type: Number, default: 0 },

    visibilityBreaks: { type: Number, default: 0 },
    suspicious: { type: Boolean, default: false },

    completedAt: { type: Date, default: null },

    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TaskWatch", TaskWatchSchema);
