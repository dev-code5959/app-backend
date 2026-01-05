const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // deposit | withdraw | earning | adjust
    type: { type: String, enum: ["deposit", "withdraw", "earning", "adjust"], required: true },

    amount: { type: Number, required: true },          // always positive number
    currency: { type: String, default: "USD" },        // optional

    status: { type: String, enum: ["pending", "approved", "rejected", "paid", "completed"], default: "pending" },

    // optional details
    note: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId },    // link to Deposit/Withdrawal/Task etc.
    meta: { type: Object, default: {} },               // store walletAddress/txHash/etc
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
