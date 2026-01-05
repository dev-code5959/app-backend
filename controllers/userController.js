const User = require("../models/User");
const Withdrawal = require("../models/Withdrawal");
const Transaction = require("../models/Transaction");

// ---------- HELPERS ----------
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ✅ 1) Wallet
exports.getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("wallet email levelName levelRank referralCode");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      balance: Number(user.wallet?.balance || 0),
      totalEarned: Number(user.wallet?.totalEarned || 0),
      referralCode: user.referralCode || "",
      email: user.email,
      levelName: user.levelName || "Free",
      levelRank: user.levelRank || 0,
    });
  } catch (e) {
    return res.status(500).json({ message: "Wallet fetch failed" });
  }
};

// ✅ 2) Referral link
exports.getReferralLink = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("referralCode");
    if (!user) return res.status(404).json({ message: "User not found" });

    const code = user.referralCode || "";
    const base = process.env.FRONTEND_URL || "http://localhost:3000";
    const link = `${base}/register?ref=${encodeURIComponent(code)}`;

    return res.json({ referralCode: code, referralLink: link });
  } catch (e) {
    return res.status(500).json({ message: "Referral link failed" });
  }
};

// ✅ 3) Withdrawal Request (FIXED + LOG + TRANSACTION)
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ message: "Invalid amount" });
    if (amt < 20) return res.status(400).json({ message: "Minimum withdrawal $20" });
    if (!walletAddress || String(walletAddress).trim().length < 6)
      return res.status(400).json({ message: "walletAddress required" });

    const balance = Number(user.wallet?.balance || 0);
    if (balance < amt) return res.status(400).json({ message: "Insufficient balance" });

    // ✅ Create Withdrawal
    const fee = amt * 0.1;
    const finalAmount = amt - fee;

    const withdrawal = await Withdrawal.create({
      userId: user._id,
      requestedAmount: amt,
      finalAmount,
      walletAddress,
      status: "pending",
    });

    // ✅ Deduct balance
    user.wallet.balance = balance - amt;
    await user.save();

    // ✅ Create Transaction log
    await Transaction.create({
      userId: user._id,
      type: "withdraw",
      amount: amt,
      status: "pending",
      refId: withdrawal._id,
      meta: { walletAddress, fee, finalAmount },
      note: "Withdrawal request created",
    });

    return res.json({
      message: "Withdrawal requested successfully",
      withdrawalId: withdrawal._id,
      requestedAmount: amt,
      fee,
      finalAmount,
      balance: user.wallet.balance,
    });
  } catch (e) {
    return res.status(500).json({ message: "Withdrawal failed" });
  }
};

// ✅ 4) Withdrawal history
exports.withdrawalHistory = async (req, res) => {
  try {
    const data = await Withdrawal.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ message: "Failed to load withdrawal history" });
  }
};

// ✅ 5) Transaction history (all/deposit/withdraw/earning)
exports.transactions = async (req, res) => {
  try {
    const type = (req.query.type || "all").toLowerCase();
    const q = { userId: req.user.id };
    if (type !== "all") q.type = type;

    const list = await Transaction.find(q).sort({ createdAt: -1 }).limit(300);
    return res.json(list || []);
  } catch (e) {
    return res.status(500).json({ message: "Failed to load transactions" });
  }
};

// ✅ 6) Income Daily report (from transactions type=earning)
exports.incomeDaily = async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const start = startOfDay(from);
    const end = endOfDay(to);

    const rows = await Transaction.aggregate([
      {
        $match: {
          userId: require("mongoose").Types.ObjectId(req.user.id),
          type: "earning",
          createdAt: { $gte: start, $lte: end },
          status: { $in: ["completed", "paid", "approved"] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: "Daily income report failed" });
  }
};

// ✅ 7) Income Monthly report
exports.incomeMonthly = async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    const rows = await Transaction.aggregate([
      {
        $match: {
          userId: require("mongoose").Types.ObjectId(req.user.id),
          type: "earning",
          createdAt: { $gte: start, $lte: end },
          status: { $in: ["completed", "paid", "approved"] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: "Monthly income report failed" });
  }
};
