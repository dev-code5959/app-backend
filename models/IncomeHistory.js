const mongoose = require("mongoose");

const IncomeHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // who caused this income (optional)
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // event uniqueness to prevent duplicate adds
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // types
    type: {
      type: String,
      enum: ["task_reward", "referral_task_commission", "referral_package_commission"],
      required: true,
    },

    // referral level (only for referral incomes)
    level: { type: Number, enum: [1, 2, 3], default: null },

    // related task/package
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    watchId: { type: mongoose.Schema.Types.ObjectId, ref: "TaskWatch", default: null },

    packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package", default: null },
    packageName: { type: String, default: "" },

    baseAmount: { type: Number, default: 0 },  // reward or package price
    percent: { type: Number, default: 0 },     // 10/5/3
    amount: { type: Number, required: true },  // earned amount (credited)

    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// prevent duplicates for same user + same event + same type + same level
IncomeHistorySchema.index(
  { userId: 1, eventId: 1, type: 1, level: 1 },
  { unique: true }
);

module.exports = mongoose.model("IncomeHistory", IncomeHistorySchema);
