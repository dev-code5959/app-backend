const mongoose = require("mongoose");

const ReferralSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },

    // commission rules
    commissionType: { type: String, enum: ["percent", "fixed"], default: "percent" },
    commissionValue: { type: Number, default: 5 }, // 5% or $5

    // plans: allow different commission per package
    perPlan: [
      {
        packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package" },
        commissionType: { type: String, enum: ["percent", "fixed"], default: "percent" },
        commissionValue: { type: Number, default: 5 },
      },
    ],

    // payout rules
    minWithdraw: { type: Number, default: 10 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReferralSettings", ReferralSettingsSchema);
