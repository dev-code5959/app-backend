// routes/admin.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Package = require("../models/Package");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const Settings = require("../models/Settings");
const Deposit = require("../models/Deposit");
const Task = require("../models/Task");
const TaskWatch = require("../models/TaskWatch");
const {auth, adminAuth } = require("../middleware/auth");
const ReferralCommission = require("../models/ReferralCommission");

// ---------------------------
// Helpers
// ---------------------------
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});

  // Ensure defaults exist
  if (!settings.referralCommission) {
    settings.referralCommission = { level1: 10, level2: 5, level3: 2 };
    await settings.save();
  }
  return settings;
}


router.get("/users", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 20)));
    const q = String(req.query.q || "").trim().toLowerCase();

    const match = q
      ? { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
      : {};

    const [users, total] = await Promise.all([
      User.find(match)
        .select("email role packageId levelRank levelName wallet referral createdAt packageActivatedAt")
        .populate("packageId", "name levelRank price maxDailyTasks")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(match),
    ]);

    const ids = users.map((u) => u._id);

    // totals deposit
    const depAgg = await Deposit.aggregate([
      { $match: { userId: { $in: ids } } },
      {
        $group: {
          _id: "$userId",
          totalDeposited: { $sum: { $ifNull: ["$amount", 0] } },
          depositCount: { $sum: 1 },
        },
      },
    ]);

    // totals withdraw (requestedAmount OR amount)
    const wdAgg = await Withdrawal.aggregate([
      { $match: { userId: { $in: ids } } },
      {
        $group: {
          _id: "$userId",
          totalWithdrawn: { $sum: { $ifNull: ["$requestedAmount", "$amount"] } },
          withdrawCount: { $sum: 1 },
        },
      },
    ]);

    // total referral bonus earned (as upline)
    const refAgg = await ReferralCommission.aggregate([
      { $match: { toUserId: { $in: ids } } },
      {
        $group: {
          _id: "$toUserId",
          totalReferralBonus: { $sum: { $ifNull: ["$amount", 0] } },
          bonusCount: { $sum: 1 },
        },
      },
    ]);

    const depMap = new Map(depAgg.map((x) => [String(x._id), x]));
    const wdMap = new Map(wdAgg.map((x) => [String(x._id), x]));
    const refMap = new Map(refAgg.map((x) => [String(x._id), x]));

    const rows = users.map((u) => {
      const dep = depMap.get(String(u._id));
      const wd = wdMap.get(String(u._id));
      const ref = refMap.get(String(u._id));

      return {
        ...u,
        totalDeposited: Number(dep?.totalDeposited || 0),
        depositCount: Number(dep?.depositCount || 0),
        totalWithdrawn: Number(wd?.totalWithdrawn || 0),
        withdrawCount: Number(wd?.withdrawCount || 0),
        totalReferralBonus: Number(ref?.totalReferralBonus || 0),
        bonusCount: Number(ref?.bonusCount || 0),
      };
    });

    res.json({ page, limit, total, rows });
  } catch (err) {
    console.error("ADMIN USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
});
router.get("/users/:id", adminAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.params.id);

    const user = await User.findById(userId)
      .select("email role packageId levelRank levelName wallet referral createdAt packageActivatedAt")
      .populate("packageId", "name levelRank price durationDays maxDailyTasks")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    // deposits + withdrawals latest
    const [deposits, withdrawals] = await Promise.all([
      Deposit.find({ userId }).sort({ createdAt: -1 }).limit(200).lean(),
      Withdrawal.find({ userId }).sort({ createdAt: -1 }).limit(200).lean(),
    ]);

    // referral tree: level 1/2/3 users
    const l1 = await User.find({ "referral.referredBy": userId })
      .select("email packageId levelRank levelName packageActivatedAt createdAt")
      .populate("packageId", "name levelRank")
      .lean();

    const l1Ids = l1.map((u) => u._id);

    const l2 = l1Ids.length
      ? await User.find({ "referral.referredBy": { $in: l1Ids } })
          .select("email packageId levelRank levelName packageActivatedAt createdAt referral.referredBy")
          .populate("packageId", "name levelRank")
          .lean()
      : [];

    const l2Ids = l2.map((u) => u._id);

    const l3 = l2Ids.length
      ? await User.find({ "referral.referredBy": { $in: l2Ids } })
          .select("email packageId levelRank levelName packageActivatedAt createdAt referral.referredBy")
          .populate("packageId", "name levelRank")
          .lean()
      : [];

    // referral bonuses earned by this user (as upline)
    const bonusHistory = await ReferralCommission.find({ toUserId: userId })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("fromUserId", "email")
      .lean();

    const totals = {
      totalDeposited: deposits.reduce((s, x) => s + Number(x.amount || 0), 0),
      totalWithdrawn: withdrawals.reduce((s, x) => s + Number(x.requestedAmount ?? x.amount ?? 0), 0),
      totalReferralBonus: bonusHistory.reduce((s, x) => s + Number(x.amount || 0), 0),
    };

    res.json({
      user,
      totals,
      deposits,
      withdrawals,
      referrals: { level1: l1, level2: l2, level3: l3 },
      bonusHistory,
    });
  } catch (err) {
    console.error("ADMIN USER DETAIL ERROR:", err);
    res.status(500).json({ message: "Failed to load user details" });
  }
});

// ---------------------------
// Packages (Admin)
// ---------------------------
router.get("/packages", adminAuth, async (req, res) => {
  try {
    const packages = await Package.find().sort({ price: 1 });
    res.json(packages);
  } catch (err) {
    res.status(500).json({ message: "Failed to load packages" });
  }
});

router.post("/packages", adminAuth, async (req, res) => {
  try {
    const pkg = await Package.create(req.body);
    res.json(pkg);
  } catch (err) {
    res.status(500).json({ message: "Failed to create package", error: err.message });
  }
});

router.put("/packages/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid package id" });

  try {
    const updated = await Package.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: "Package not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update package" });
  }
});

router.delete("/packages/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid package id" });

  try {
    const deleted = await Package.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Package not found" });
    res.json({ message: "Package deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete package" });
  }
});

// Create task (Admin)
router.get("/tasks", adminAuth, async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: "Failed to load tasks" });
  }
});

// router.post("/tasks", adminAuth, async (req, res) => {
//   try {
//     const { title, reward, link, minLevelRank, videoUrl, provider, watchSeconds, isActive } = req.body;

//     if (!title || reward == null) {
//       return res.status(400).json({ message: "title and reward required" });
//     }

//     const task = await Task.create({
//       title: String(title).trim(),
//       reward: Number(reward),
//       link: String(link || "").trim(),
//       minLevelRank: Number(minLevelRank || 1),
//       videoUrl: String(videoUrl || "").trim(),
//       provider: provider === "youtube" ? "youtube" : "mp4",
//       watchSeconds: Math.max(10, Number(watchSeconds || 10)),
//       isActive: isActive !== undefined ? Boolean(isActive) : true,
//       type: "video",
//     });

//     res.json(task);
//   } catch (err) {
//     res.status(500).json({ message: "Failed to create task", error: err.message });
//   }
// });

router.post("/tasks", adminAuth, async (req, res) => {
  const { title, reward, level1Reward, level2Reward, level3Reward, link, minLevelRank, videoUrl, provider, watchSeconds, isActive } = req.body;

  if (!title || reward == null) {
    return res.status(400).json({ message: "Title and reward required" });
  }

  const task = await Task.create({
    title: String(title).trim(),
    reward: Number(reward),  // Default reward
    level1Reward: Number(level1Reward || 1),  // Reward for level 1 users
    level2Reward: Number(level2Reward || 2),  // Reward for level 2 users
    level3Reward: Number(level3Reward || 3),  // Reward for level 3 users
    link: String(link || "").trim(),
    minLevelRank: Number(minLevelRank || 1),
    videoUrl: String(videoUrl || "").trim(),
    provider: provider === "youtube" ? "youtube" : "mp4",
    watchSeconds: Math.max(10, Number(watchSeconds || 10)),
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    type: "video",
  });

  res.json(task);
});




// Delete task (Admin)
router.delete("/tasks/:id", adminAuth, async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    return res.json({ message: "Task deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete task" });
  }
});
// ---------------------------
// Referral Settings (Admin)
// ---------------------------
// Update referral settings
router.put("/referral-settings", adminAuth, async (req, res) => {
  try {
    const { level1, level2, level3 } = req.body;
    const settings = await getOrCreateSettings();

    // Save updated commission rates
    if (level1 !== undefined) settings.referralCommission.level1 = Number(level1);
    if (level2 !== undefined) settings.referralCommission.level2 = Number(level2);
    if (level3 !== undefined) settings.referralCommission.level3 = Number(level3);

    await settings.save();
    res.json({ message: "Referral settings updated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update referral settings" });
  }
});

router.get("/referral-settings", adminAuth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings.referralCommission || { level1: 10, level2: 5, level3: 2 });
  } catch (err) {
    res.status(500).json({ message: "Failed to load referral settings" });
  }
});
router.post("/announcement", adminAuth, async (req, res) => {
  // You can store in DB later. For now just accept and return OK.
  const { title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ message: "title and message required" });
  res.json({ message: "Announcement sent" });
});

// ---------------------------
// Crypto Settings (Admin)
// ---------------------------
router.get("/settings/crypto", adminAuth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({
      usdtAddress: settings.usdtAddress || "",
      btcAddress: settings.btcAddress || "",
      ltcAddress: settings.ltcAddress || "",
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load crypto settings" });
  }
});

router.put("/settings/crypto", adminAuth, async (req, res) => {
  try {
    const { usdtAddress, btcAddress, ltcAddress } = req.body;
    const settings = await getOrCreateSettings();

    settings.usdtAddress = String(usdtAddress || "");
    settings.btcAddress = String(btcAddress || "");
    settings.ltcAddress = String(ltcAddress || "");

    await settings.save();

    res.json({
      message: "Crypto settings updated",
      usdtAddress: settings.usdtAddress,
      btcAddress: settings.btcAddress,
      ltcAddress: settings.ltcAddress,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update crypto settings" });
  }
});

// ---------------------------
// Deposits (Admin)
// ---------------------------
router.get("/deposits", adminAuth, async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .populate("userId", "email")
      .sort({ createdAt: -1 });

    res.json(deposits);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch deposits" });
  }
});

router.put("/deposit/:id/:action", adminAuth, async (req, res) => {
  const { id, action } = req.params;

  if (!isValidObjectId(id)) return res.status(400).json({ msg: "Invalid deposit id" });
  if (!["approve", "reject"].includes(action)) return res.status(400).json({ msg: "Invalid action" });

  try {
    const deposit = await Deposit.findById(id);
    if (!deposit) return res.status(404).json({ msg: "Deposit not found" });
    if (deposit.status !== "pending") return res.status(400).json({ msg: "Deposit already processed" });

    if (action === "approve") {
      const user = await User.findById(deposit.userId);
      if (!user) return res.status(404).json({ msg: "User not found" });

      const amt = Number(deposit.amount || 0);
      user.wallet.balance += amt;

      // // referral commission 10%
      // if (user.referredBy) {
      //   const referrer = await User.findById(user.referredBy);
      //   if (referrer) {
      //     const commission = amt * 0.1;
      //     referrer.wallet.balance += commission;
      //     referrer.referralEarnings = (referrer.referralEarnings || 0) + commission;
      //     await referrer.save();
      //   }
      // }
// ✅ 3-level referral commission (settings-based): L1 10%, L2 5%, L3 2%
        const settings = await getOrCreateSettings();

        const lvl1 = Number(settings.referralCommission?.level1 ?? 10);
        const lvl2 = Number(settings.referralCommission?.level2 ?? 5);
        const lvl3 = Number(settings.referralCommission?.level3 ?? 2);

        const ensureWallet = (u) => {
          if (!u.wallet) u.wallet = { balance: 0 };
          if (typeof u.wallet.balance !== "number") u.wallet.balance = Number(u.wallet.balance || 0);
        };

        const payReferral = async (toUser, percent) => {
          if (!toUser || !percent || percent <= 0) return 0;

          ensureWallet(toUser);

          const commission = amt * (percent / 100);
          toUser.wallet.balance += commission;
          toUser.referralEarnings = (toUser.referralEarnings || 0) + commission;

          await toUser.save();
          return commission;
        };

        // Level 1 (direct)
        const u1 = user.referredBy ? await User.findById(user.referredBy) : null;
        // Level 2
        const u2 = u1?.referredBy ? await User.findById(u1.referredBy) : null;
        // Level 3
        const u3 = u2?.referredBy ? await User.findById(u2.referredBy) : null;

        await payReferral(u1, lvl1);
        await payReferral(u2, lvl2);
        await payReferral(u3, lvl3);

      deposit.status = "completed";
      await user.save();
      await deposit.save();

      return res.json({ msg: "Deposit approved and balance credited!" });
    }

    deposit.status = "rejected";
    await deposit.save();
    res.json({ msg: "Deposit rejected successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

// ---------------------------
// Withdrawals (Admin)
// ---------------------------
router.get("/withdrawals", adminAuth, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find()
      .populate("userId", "email") // ✅ fix email missing
      .sort({ createdAt: -1 });

    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ message: "Failed to load withdrawals" });
  }
});

router.put("/withdraw/:id/:action", adminAuth, async (req, res) => {
  const { id, action } = req.params;

  if (!isValidObjectId(id)) return res.status(400).json({ msg: "Invalid withdrawal id" });
  if (!["approve", "reject", "cancel"].includes(action)) {
    return res.status(400).json({ msg: "Invalid action" });
  }

  try {
    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) return res.status(404).json({ msg: "Withdrawal not found" });

    if (["paid", "rejected", "cancelled"].includes(withdrawal.status)) {
      return res.status(400).json({ msg: "Withdrawal already processed" });
    }

    if (action === "approve") withdrawal.status = "paid";
    if (action === "reject") withdrawal.status = "rejected";
    if (action === "cancel") withdrawal.status = "cancelled";

    await withdrawal.save();
    res.json({ msg: `Withdrawal ${action}ed` });
  } catch (err) {
    res.status(500).json({ msg: "Server Error" });
  }
});

// ---------------------------
// Stats (Admin)
// ---------------------------
router.get("/stats", adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const pendingDeposits = await Deposit.countDocuments({ status: "pending" });
    const pendingWithdrawals = await Withdrawal.countDocuments({ status: "pending" });

    const depAgg = await Deposit.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const wdAgg = await Withdrawal.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$requestedAmount" } } },
    ]);

    const totalDeposited = depAgg[0]?.total || 0;
    const totalWithdrawn = wdAgg[0]?.total || 0;

    res.json({
      totalUsers,
      totalDeposited,
      totalWithdrawn,
      netProfit: totalDeposited - totalWithdrawn,
      pendingDeposits,
      pendingWithdrawals,
    });
  } catch (err) {
    res.status(500).json({ msg: "Internal Server Error" });
  }
});
// GET /api/admin/watch-analytics
router.get("/watch-analytics", adminAuth, async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    const data = await TaskWatch.aggregate([
      {
        $group: {
          _id: "$taskId",
          totalSessions: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          suspicious: {
            $sum: { $cond: [{ $eq: ["$suspicious", true] }, 1, 0] },
          },
          avgHeartbeats: { $avg: "$heartbeatCount" },
        },
      },
      { $sort: { totalSessions: -1 } },
    ]);

    res.json(data);
  } catch (err) {
    console.error("ADMIN ANALYTICS ERROR:", err);
    res.status(500).json({ message: "Failed to load analytics" });
  }
});
// GET /api/admin/watch-suspicious
router.get("/watch-suspicious", adminAuth, async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    const list = await TaskWatch.find({ suspicious: true })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("userId", "email cheat")
      .populate("taskId", "title watchSeconds provider");

    res.json(list);
  } catch (err) {
    console.error("ADMIN SUSPICIOUS ERROR:", err);
    res.status(500).json({ message: "Failed to load suspicious sessions" });
  }
});
// ✅ POST /api/admin/reset-daily-tasks
router.post("/reset-daily-tasks", adminAuth, async (req, res) => {
  await User.updateMany(
    {},
    {
      $set: {
        "tasks.completedToday": 0,
        "tasks.completedTaskIds": [],
        "tasks.lastReset": new Date(),
      },
    }
  );

  const settings = await getOrCreateSettings();
  settings.lastResetAt = new Date();
  await settings.save();

  res.json({ message: "All users' daily tasks have been reset successfully" });
});
// ✅ POST /api/admin/disable-tasks
router.post("/disable-tasks", adminAuth, async (req, res) => {
  await Task.updateMany({}, { $set: { disabled: true } });

  const settings = await getOrCreateSettings();
  settings.tasksDisabled = true;
  await settings.save();

  res.json({ message: "All tasks have been disabled for today" });
});
// ✅ POST /api/admin/enable-tasks
router.post("/enable-tasks", adminAuth, async (req, res) => {
  await Task.updateMany({}, { $set: { disabled: false } });

  const settings = await getOrCreateSettings();
  settings.tasksDisabled = false;
  await settings.save();

  res.json({ message: "All tasks have been enabled" });
});
// ✅ POST /api/admin/disable-withdrawals
router.post("/disable-withdrawals", adminAuth, async (req, res) => {
  const settings = await getOrCreateSettings();
  settings.withdrawalsDisabled = true;
  await settings.save();

  res.json({ message: "Withdrawals disabled (global)" });
});
// ✅ POST /api/admin/enable-withdrawals (optional but recommended)
router.post("/enable-withdrawals", adminAuth, async (req, res) => {
  const settings = await getOrCreateSettings();
  settings.withdrawalsDisabled = false;
  await settings.save();

  res.json({ message: "Withdrawals enabled (global)" });
});
// ✅ POST /api/admin/toggle-offday
router.post("/toggle-offday", adminAuth, async (req, res) => {
  const { disable } = req.body;

  const settings = await getOrCreateSettings();
  settings.offday = !!disable;
  await settings.save();

  res.json({ message: disable ? "Offday ON" : "Offday OFF" });
});
// ---------------------------
// System Control Status (Admin)
// GET /api/admin/system/status
// ---------------------------
// ✅ GET /api/admin/system/status
router.get("/system/status", adminAuth, async (req, res) => {
  const settings = await getOrCreateSettings();

  res.json({
    tasksDisabled: !!settings.tasksDisabled,
    offday: !!settings.offday,
    withdrawalsDisabled: !!settings.withdrawalsDisabled,
    lastResetAt: settings.lastResetAt || null,
  });
});

module.exports = router;
