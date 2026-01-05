// models/Task.js
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    reward: { type: Number, required: true, min: 0 },  // General reward if not level-specific

    // Reward per level (level-specific rewards)
    level1Reward: { type: Number, default: 1, min: 0 },  // Default for level 1 users
    level2Reward: { type: Number, default: 2, min: 0 },  // Default for level 2 users
    level3Reward: { type: Number, default: 3, min: 0 },  // Default for level 3 users

    // link optional
    link: { type: String, default: "", trim: true },

    // "video" tasks can be self-hosted mp4 or youtube
    type: { type: String, enum: ["video", "link", "custom"], default: "video" },

    // ✅ NEW: video provider
    provider: { type: String, enum: ["mp4", "youtube"], default: "mp4" },

    // ✅ NEW: required watch time per task
    watchSeconds: { type: Number, default: 10, min: 10 },

    minLevelRank: { type: Number, default: 1, min: 0 },
    
    // Task Active Status (enabled/disabled)
    isActive: { type: Boolean, default: true },
  // Task disabled status (off)
    disabled: { type: Boolean, default: false },  // To disable the task

    // video url (mp4 or youtube url)
    videoUrl: { type: String, default: "" },

    // Date when the task was disabled (optional)
    disabledAt: { type: Date, default: null },

  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", taskSchema);
