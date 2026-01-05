// models/Notice.js
const mongoose = require("mongoose");

const NoticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // info | warning | success | danger
    type: { type: String, enum: ["info", "warning", "success", "danger"], default: "info" },

    isActive: { type: Boolean, default: true },

    // optional scheduling
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

NoticeSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model("Notice", NoticeSchema);
