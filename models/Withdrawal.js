// models/Withdrawal.js
const mongoose = require("mongoose");

const WithdrawalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // user request amount
    requestedAmount: { type: Number, required: true },

    // fee & payout
    feePercent: { type: Number, default: 10 }, // 10% fee
    feeAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },

    // payout address
    walletAddress: { type: String, required: true, trim: true },

    // admin processing status
    status: {
      type: String,
      enum: ["pending", "approved", "paid", "rejected", "failed"],
      default: "pending",
    },

    note: { type: String, default: "" },
  },
  { timestamps: true }
);
WithdrawalSchema.index({ userId: 1, createdAt: -1 });
WithdrawalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Withdrawal", WithdrawalSchema);
