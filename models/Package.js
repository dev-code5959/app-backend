// models/Package.js
const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Silver/Gold
    price: { type: Number, required: true, min: 0 },

    levelRank: { type: Number, required: true, min: 1 }, // Silver=1, Gold=2 ...
    maxDailyTasks: { type: Number, required: true, min: 0 }, // Silver=5

    durationDays: { type: Number, default: 30, min: 1 },

    isActive: { type: Boolean, default: true },

    category: { type: String, default: "Standard" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Package", packageSchema);
