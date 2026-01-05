const mongoose = require("mongoose");

const ReferralCommissionSchema = new mongoose.Schema(
  {
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },   // upline
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // buyer
    level: { type: Number, enum: [1, 2, 3], required: true },

    basis: { type: String, enum: ["package_purchase"], default: "package_purchase" },

    baseAmount: { type: Number, required: true }, // package price
    percent: { type: Number, required: true },    // 10/5/2
    amount: { type: Number, required: true },     // commission = baseAmount * percent/100

    packageId: { type: mongoose.Schema.Types.ObjectId, ref: "Package", default: null },
    packageName: { type: String, default: "" },
    packageLevelRank: { type: Number, default: 0 },
    purchaseEventId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

  },
  
  { timestamps: true }
);

// prevent duplicate commission for same buyer+package+level (optional but recommended)
ReferralCommissionSchema.index(
  { toUserId: 1, fromUserId: 1, packageId: 1, level: 1, basis: 1 },
  { unique: true, sparse: true }
);
ReferralCommissionSchema.index({ toUserId: 1, createdAt: -1 });
ReferralCommissionSchema.index({ fromUserId: 1, createdAt: -1 });

module.exports = mongoose.model("ReferralCommission", ReferralCommissionSchema);
