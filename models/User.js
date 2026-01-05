// models/User.js
const mongoose = require("mongoose");

const ReferralSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 4,
      maxlength: 20,
      default: undefined, // ✅ prevents null duplicates
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approved: { type: Boolean, default: true },
    blocked: { type: Boolean, default: false },

    count: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    password: { type: String, required: true },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },

    // ✅ package info
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package", default: null, index: true },
    packageActivatedAt: { type: Date, default: null }, // ✅ NEW (for referrals UI)

    levelRank: { type: Number, default: 0, index: true },
    levelName: { type: String, default: "Free" },

    wallet: {
      balance: { type: Number, default: 0 },
      totalEarned: { type: Number, default: 0 },
    },

    tasks: {
      completedToday: { type: Number, default: 0 },
      completedTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
      lastReset: { type: Date, default: Date.now },
    },

    cheat: {
      strikes: { type: Number, default: 0 },
      blockedUntil: { type: Date, default: null },
      lastStrikeAt: { type: Date, default: null },
    },

    // ✅ referral object
    referral: { type: ReferralSchema, default: () => ({}) },

    // ✅ optional audit fields (helpful)
    lastReferralAppliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ Unique only when referral.code exists
UserSchema.index(
  { "referral.code": 1 },
  {
    unique: true,
    partialFilterExpression: { "referral.code": { $type: "string" } },
  }
);
UserSchema.index({ packageId: 1 });
UserSchema.index({ "referral.referredBy": 1 });


module.exports = mongoose.model("User", UserSchema);
