// routes/user.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose"); // ✅ ADD THIS

// ===================== MODELS =====================
const User = require("../models/User");
const Package = require("../models/Package");
const Deposit = require("../models/Deposit");
const Withdrawal = require("../models/Withdrawal");
const Task = require("../models/Task");
const Settings = require("../models/Settings");
const TaskWatch = require("../models/TaskWatch");
const { addStrike, isBlocked } = require("../utils/cheat");
const ReferralCommission = require("../models/ReferralCommission");
const IncomeHistory = require("../models/IncomeHistory");
const Notice = require("../models/Notice");

// ===================== MIDDLEWARE =====================
const userAuth = require("../middleware/userAuth");

// ===================== MULTER CONFIG =====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpg|jpeg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Only JPG, JPEG, PNG allowed"));
  },
});

// ===================== HELPERS =====================
function ensureUserTasks(user) {
  if (!user.tasks) {
    user.tasks = { completedToday: 0, lastReset: new Date(), completedTaskIds: [] };
  }
  if (!Array.isArray(user.tasks.completedTaskIds)) user.tasks.completedTaskIds = [];
  if (typeof user.tasks.completedToday !== "number") user.tasks.completedToday = 0;
  if (!user.tasks.lastReset) user.tasks.lastReset = new Date();
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function getIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    ""
  );
}

// ===================== ROUTES =====================

// Health check
router.get("/ping", (req, res) => res.send("USER ROUTE WORKS"));

// -------- PROFILE --------
// router.get("/profile", userAuth, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("-password");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     return res.json({
//       id: user._id,
//       email: user.email,
//       role: user.role,

//       // ✅ IMPORTANT FIX
//       referralCode: user.referral?.code || "",

//       referral: user.referral,
//       wallet: user.wallet,
//       levelRank: user.levelRank,
//       levelName: user.levelName,
//       packageId: user.packageId,
//       createdAt: user.createdAt,
//     });
//   } catch (err) {
//     return res.status(500).json({ message: "Server error" });
//   }
// });

router.get("/profile", userAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return res.status(404).json({ message: "User not found" });

  const obj = user.toObject();

  // ✅ add these for frontend compatibility
  obj.referralCode = obj.referral?.code || "";
  obj.referredBy = obj.referral?.referredBy || null;

  return res.json(obj);
});

// -------- ANNOUNCEMENT --------
router.get("/announcement", userAuth, (req, res) => res.json(null));

// -------- CRYPTO SETTINGS --------
router.get("/crypto-settings", userAuth, async (req, res) => {
  try {
    const settings = await Settings.findOne();
    return res.json({
      usdtAddress: settings?.usdtAddress || "",
      btcAddress: settings?.btcAddress || "",
      ltcAddress: settings?.ltcAddress || "",
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load crypto settings" });
  }
});

// -------- PACKAGES (ONLY ONCE) --------
router.get("/packages", userAuth, async (req, res) => {
  try {
    const list = await Package.find({ isActive: true }).sort({ levelRank: 1 });
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ message: "Failed to load packages" });
  }
});

// -------- TASKS (LEVEL BASED + DAILY RESET) --------
router.get("/tasks", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    ensureUserTasks(user);

    const now = new Date();
    if (!isSameDay(user.tasks.lastReset, now)) {
      user.tasks.completedToday = 0;
      user.tasks.completedTaskIds = [];
      user.tasks.lastReset = now;
      await user.save();
    }

    // if no package, no tasks
    if (!user.packageId) {
      return res.json({
        tasks: [],
        completedToday: user.tasks.completedToday,
        maxDailyTasks: 0,
        levelRank: Number(user.levelRank || 0),
        levelName: user.levelName || "Free",
      });
    }

    const pkg = await Package.findById(user.packageId).select("maxDailyTasks isActive");
    if (!pkg || !pkg.isActive) {
      return res.json({
        tasks: [],
        completedToday: user.tasks.completedToday,
        maxDailyTasks: 0,
        levelRank: Number(user.levelRank || 0),
        levelName: user.levelName || "Free",
      });
    }

    const levelRank = Number(user.levelRank || 0);

    const tasks = await Task.find({
      isActive: true,
      minLevelRank: { $lte: levelRank },
    }).sort({ createdAt: -1 });

    return res.json({
      tasks,
      completedToday: user.tasks.completedToday,
      maxDailyTasks: Number(pkg.maxDailyTasks || 0),
      levelRank,
      levelName: user.levelName || "Free",
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load tasks" });
  }
});



// routes/user.js (or wherever your buy-package route is)
// router.post("/buy-package", userAuth, async (req, res) => {
//   const session = await mongoose.startSession();

//   try {
//     const { packageId } = req.body;
//     if (!packageId) return res.status(400).json({ message: "packageId required" });

//     await session.withTransaction(async () => {
//       const pkg = await Package.findById(packageId).session(session);
//       if (!pkg || !pkg.isActive) {
//         throw Object.assign(new Error("Package not found"), { status: 404 });
//       }

//       const user = await User.findById(req.user.id).session(session);
//       if (!user) throw Object.assign(new Error("User not found"), { status: 404 });

//       // prevent buying same package again (optional)
//       if (String(user.packageId || "") === String(pkg._id)) {
//         throw Object.assign(new Error("This package is already active"), { status: 400 });
//       }

//       if (!user.wallet) user.wallet = { balance: 0, totalEarned: 0 };

//       const price = Number(pkg.price || 0);
//       if (price <= 0) throw Object.assign(new Error("Invalid package price"), { status: 400 });

//       const balance = Number(user.wallet.balance || 0);
//       if (balance < price) throw Object.assign(new Error("Insufficient balance"), { status: 400 });

//       // ✅ unique purchase event id (prevents duplicate commission on retry)
//       const purchaseEventId = new mongoose.Types.ObjectId();

//       // 1) deduct balance
//       user.wallet.balance = Number((balance - price).toFixed(2));

//       // 2) activate package
//       user.packageId = pkg._id;
//       user.levelRank = Number(pkg.levelRank || 0);
//       user.levelName = String(pkg.name || "Member");
//       user.packageActivatedAt = new Date();

//       // reset daily tasks
//       if (!user.tasks) user.tasks = {};
//       user.tasks.completedToday = 0;
//       user.tasks.completedTaskIds = [];
//       user.tasks.lastReset = new Date();

//       await user.save({ session });

//       // 3) referral rules
//       const settings = await Settings.findOne().lean();
//       const levelRules = settings?.referralCommission || { level1: 10, level2: 5, level3: 2 };

//       // helper: pay commission (safe + checks referral blocked)
//       const payCommission = async (toUserId, level, percent) => {
//         if (!toUserId) return;
//         if (String(toUserId) === String(user._id)) return; // no self payout

//         const upline = await User.findById(toUserId).session(session);
//         if (!upline) return;

//         // optional: skip blocked/disabled uplines
//         if (upline.referral?.blocked) return;
//         if (upline.referral?.approved === false) return;

//         const commissionAmount = Number(((price * Number(percent || 0)) / 100).toFixed(2));
//         if (commissionAmount <= 0) return;

//         // ✅ create commission record ONCE per purchase event
//         await ReferralCommission.create(
//           [
//             {
//               purchaseEventId,
//               toUserId: upline._id,
//               fromUserId: user._id,
//               level,
//               basis: "package_purchase",
//               baseAmount: price,
//               percent: Number(percent || 0),
//               amount: commissionAmount,
//               packageId: pkg._id,
//               packageName: pkg.name,
//               packageLevelRank: Number(pkg.levelRank || 0),
//             },
//           ],
//           { session }
//         );

//         if (!upline.wallet) upline.wallet = { balance: 0, totalEarned: 0 };

//         upline.wallet.balance = Number((Number(upline.wallet.balance || 0) + commissionAmount).toFixed(2));
//         upline.wallet.totalEarned = Number((Number(upline.wallet.totalEarned || 0) + commissionAmount).toFixed(2));

//         if (upline.referral) {
//           upline.referral.totalCommission = Number(
//             (Number(upline.referral.totalCommission || 0) + commissionAmount).toFixed(2)
//           );
//         }

//         await upline.save({ session });
//       };

//       // find uplines (L1 -> L3)
//       const l1 = user?.referral?.referredBy || null;

//       let l2 = null;
//       let l3 = null;

//       if (l1) {
//         const l1User = await User.findById(l1).select("referral.referredBy referral.blocked referral.approved").session(session);
//         if (l1User && !l1User.referral?.blocked && l1User.referral?.approved !== false) {
//           l2 = l1User?.referral?.referredBy || null;

//           if (l2) {
//             const l2User = await User.findById(l2).select("referral.referredBy referral.blocked referral.approved").session(session);
//             if (l2User && !l2User.referral?.blocked && l2User.referral?.approved !== false) {
//               l3 = l2User?.referral?.referredBy || null;
//             }
//           }
//         }
//       }

//       // pay L1/L2/L3
//       if (l1) await payCommission(l1, 1, levelRules.level1 || 10);
//       if (l2) await payCommission(l2, 2, levelRules.level2 || 5);
//       if (l3) await payCommission(l3, 3, levelRules.level3 || 2);

//       // success payload
//       res.json({
//         message: "Package activated successfully",
//         user: {
//           id: user._id,
//           email: user.email,
//           packageId: user.packageId,
//           levelRank: user.levelRank,
//           levelName: user.levelName,
//           balance: user.wallet.balance,
//           packageActivatedAt: user.packageActivatedAt,
//         },
//       });
//     });
//   } catch (err) {
//     console.error("BUY PACKAGE ERROR:", err);

//     // custom status
//     const status = err?.status || 500;

//     // if commission duplicates happen (index), we still consider package activated
//     if (err?.code === 11000) {
//       return res.json({ message: "Package activated (commission already processed)" });
//     }

//     return res.status(status).json({ message: err.message || "Failed to buy package" });
//   } finally {
//     session.endSession();
//   }
// });
router.post("/buy-package", userAuth, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { packageId } = req.body;
    if (!packageId) return res.status(400).json({ message: "packageId required" });

    let responsePayload = null;

    await session.withTransaction(async () => {
      const pkg = await Package.findById(packageId).session(session);
      if (!pkg || !pkg.isActive) {
        const e = new Error("Package not found");
        e.status = 404;
        throw e;
      }

      const user = await User.findById(req.user.id).session(session);
      if (!user) {
        const e = new Error("User not found");
        e.status = 404;
        throw e;
      }

      // optional: prevent buying same package
      if (String(user.packageId || "") === String(pkg._id)) {
        const e = new Error("This package is already active");
        e.status = 400;
        throw e;
      }

      if (!user.wallet) user.wallet = { balance: 0, totalEarned: 0 };

      const price = Number(pkg.price || 0);
      if (price <= 0) {
        const e = new Error("Invalid package price");
        e.status = 400;
        throw e;
      }

      const balance = Number(user.wallet.balance || 0);
      if (balance < price) {
        const e = new Error("Insufficient balance");
        e.status = 400;
        throw e;
      }

      // ✅ unique purchase event id
      const purchaseEventId = new mongoose.Types.ObjectId();

      // 1) deduct balance
      user.wallet.balance = Number((balance - price).toFixed(2));

      // 2) activate package
      user.packageId = pkg._id;
      user.levelRank = Number(pkg.levelRank || 0);
      user.levelName = String(pkg.name || "Member");
      user.packageActivatedAt = new Date();

      // reset daily tasks
      if (!user.tasks) user.tasks = {};
      user.tasks.completedToday = 0;
      user.tasks.completedTaskIds = [];
      user.tasks.lastReset = new Date();

      await user.save({ session });

      // 3) referral rules (✅ session added)
      const settings = await Settings.findOne().session(session).lean();
      const levelRules = settings?.referralCommission || { level1: 10, level2: 5, level3: 2 };

      // helper
      const payCommission = async (toUserId, level, percent) => {
        if (!toUserId) return;
        if (String(toUserId) === String(user._id)) return;

        const upline = await User.findById(toUserId).session(session);
        if (!upline) return;

        if (upline.referral?.blocked) return;
        if (upline.referral?.approved === false) return;

        const pct = Number(percent || 0);
        const commissionAmount = Number(((price * pct) / 100).toFixed(2));
        if (commissionAmount <= 0) return;

        // ✅ create commission (ignore duplicates safely)
        try {
          await ReferralCommission.create(
            [
              {
                purchaseEventId,
                toUserId: upline._id,
                fromUserId: user._id,
                level,
                basis: "package_purchase",
                baseAmount: price,
                percent: pct,
                amount: commissionAmount,
                packageId: pkg._id,
                packageName: pkg.name,
                packageLevelRank: Number(pkg.levelRank || 0),
              },
            ],
            { session }
          );
        } catch (err) {
          // if already processed, do not crash transaction
          if (err?.code === 11000) return;
          throw err;
        }

        if (!upline.wallet) upline.wallet = { balance: 0, totalEarned: 0 };

        upline.wallet.balance = Number((Number(upline.wallet.balance || 0) + commissionAmount).toFixed(2));
        upline.wallet.totalEarned = Number((Number(upline.wallet.totalEarned || 0) + commissionAmount).toFixed(2));

        upline.referral = upline.referral || {};
        upline.referral.totalCommission = Number(
          (Number(upline.referral.totalCommission || 0) + commissionAmount).toFixed(2)
        );

        await upline.save({ session });
      };

      // find uplines
      const l1 = user?.referral?.referredBy || null;
      let l2 = null;
      let l3 = null;

      if (l1) {
        const l1User = await User.findById(l1).select("referral.referredBy").session(session);
        l2 = l1User?.referral?.referredBy || null;

        if (l2) {
          const l2User = await User.findById(l2).select("referral.referredBy").session(session);
          l3 = l2User?.referral?.referredBy || null;
        }
      }

      // pay commissions
      if (l1) await payCommission(l1, 1, levelRules.level1 ?? 10);
      if (l2) await payCommission(l2, 2, levelRules.level2 ?? 5);
      if (l3) await payCommission(l3, 3, levelRules.level3 ?? 2);

      // prepare response (✅ send after transaction ends)
      responsePayload = {
        message: "Package activated successfully",
        user: {
          id: user._id,
          email: user.email,
          packageId: user.packageId,
          levelRank: user.levelRank,
          levelName: user.levelName,
          balance: user.wallet.balance,
          packageActivatedAt: user.packageActivatedAt,
        },
      };
    });

    return res.json(responsePayload);
  } catch (err) {
    console.error("BUY PACKAGE ERROR:", err);
    return res.status(err?.status || 500).json({ message: err?.message || "Failed to buy package" });
  } finally {
    await session.endSession();
  }
});

// -------- SUBMIT DEPOSIT --------
router.post("/deposit", userAuth, upload.single("receipt"), async (req, res) => {
  try {
    const { amount, transactionHash, currency } = req.body;
    if (!req.file) return res.status(400).json({ message: "Receipt image required" });

    if (!amount || !transactionHash || !currency) {
      return res.status(400).json({ message: "amount, transactionHash, currency required" });
    }

    const deposit = new Deposit({
      userId: req.user.id,
      amount: Number(amount),
      transactionHash: String(transactionHash),
      currency: String(currency),
      receiptImage: req.file.path,
      status: "pending",
    });

    await deposit.save();
    return res.json({ message: "Deposit submitted for approval" });
  } catch (err) {
    return res.status(500).json({ message: "Deposit failed", error: err.message });
  }
});

// -------- REQUEST WITHDRAWAL (MAIN) --------
// router.post("/request-withdrawal", userAuth, async (req, res) => {
//   try {
//     const { amount, walletAddress } = req.body;

//     const user = await User.findById(req.user.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const amt = Number(amount);
//     if (!amt || amt < 20) return res.status(400).json({ message: "Minimum withdrawal $20" });
//     if (!walletAddress) return res.status(400).json({ message: "walletAddress required" });

//     if (Number(user.wallet?.balance || 0) < amt) {
//       return res.status(400).json({ message: "Insufficient balance" });
//     }

//     const fee = amt * 0.1;
//     const finalAmount = amt - fee;

//     const withdrawal = new Withdrawal({
//       userId: user._id,
//       requestedAmount: amt,
//       finalAmount,
//       walletAddress,
//       status: "pending",
//     });

//     user.wallet.balance -= amt;

//     await user.save();
//     await withdrawal.save();

//     return res.json({ message: "Withdrawal requested", finalAmount });
//   } catch (err) {
//     return res.status(500).json({ message: "Withdrawal failed", error: err.message });
//   }
// });

// -------- REQUEST WITHDRAWAL --------
router.post("/request-withdrawal", userAuth, async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const amt = Number(amount);

    // ✅ Allowed amounts (UI dropdown অনুযায়ী)
    const allowedAmounts = [10, 30, 50, 100, 300, 500, 1000, 100000];
    if (!allowedAmounts.includes(amt)) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }

    if (!walletAddress || String(walletAddress).trim().length < 10) {
      return res.status(400).json({ message: "walletAddress required" });
    }

    const balance = Number(user.wallet?.balance || 0);
    if (balance < amt) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // ✅ Fee calculation (10%)
    const feePercent = 10;
    const feeAmount = Number(((amt * feePercent) / 100).toFixed(2));
    const finalAmount = Number((amt - feeAmount).toFixed(2));

    // ✅ Save withdrawal request
    const withdrawal = await Withdrawal.create({
      userId: user._id,
      requestedAmount: amt,
      feePercent,
      feeAmount,
      finalAmount,
      walletAddress: String(walletAddress).trim(),
      status: "pending",
    });

    // ✅ Deduct balance immediately (like your current logic)
    user.wallet.balance = Number((balance - amt).toFixed(2));
    await user.save();

    return res.json({
      message: "Withdrawal requested",
      withdrawal,
      balance: user.wallet.balance,
    });
  } catch (err) {
    console.error("Withdrawal error:", err);
    return res.status(500).json({ message: "Withdrawal failed" });
  }
});
router.get("/withdraw-history", userAuth, async (req, res) => {
  try {
    const data = await Withdrawal.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: "Failed to load withdrawal history" });
  }
});


// ✅ OPTIONAL ALIAS (if your frontend calls /withdraw)
router.post("/withdraw", userAuth, async (req, res) => {
  // forward to same logic
  req.url = "/request-withdrawal";
  return router.handle(req, res);
});

// -------- HISTORY --------
router.get("/deposit-history", userAuth, async (req, res) => {
  try {
    const data = await Deposit.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: "Failed to load deposit history" });
  }
});

router.get("/referral", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("email referral");
    if (!user) return res.status(404).json({ message: "User not found" });

    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const code = user.referral?.code || "";

    return res.json({
      referralCode: code,
      referralLink: `${baseUrl}/register?ref=${code}`,
      referralCount: Number(user.referral?.count || 0),
      referralBlocked: Boolean(user.referral?.blocked || false),
      approved: Boolean(user.referral?.approved ?? true),
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to load referral info" });
  }
});


router.post("/tasks/:taskId/start", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (isBlocked(user)) {
      return res
        .status(403)
        .json({ message: "Account temporarily blocked for suspicious activity" });
    }

    const task = await Task.findById(req.params.taskId);
    if (!task || !task.isActive) return res.status(404).json({ message: "Task not found" });

    // level check
    const userRank = Number(user.levelRank || 0);
    if (userRank < Number(task.minLevelRank || 0)) {
      return res.status(403).json({ message: "Your level cannot access this task" });
    }

    // prevent multiple active sessions for same task
    await TaskWatch.updateMany(
      { userId: user._id, taskId: task._id, status: "active" },
      { status: "expired" }
    );

    const requiredSeconds = Math.max(10, Number(task.watchSeconds || 10));
    const canCompleteAt = new Date(Date.now() + requiredSeconds * 1000);

    const now = new Date();

    const watch = await TaskWatch.create({
      userId: user._id,
      taskId: task._id,

      requiredSeconds,
      canCompleteAt,

      // ✅ NEW (important for history)
      startedAt: now,
      watchedSeconds: 0,
      rewardEarned: 0,
      lastHeartbeatAt: null,
      heartbeatCount: 0,

      userAgent: String(req.headers["user-agent"] || ""),
      ip: getIp(req),
    });

    return res.json({
      watchId: watch._id,
      requiredSeconds,
      canCompleteAt,
      provider: task.provider,
      videoUrl: task.videoUrl,
      title: task.title,
      reward: task.reward,
    });
  } catch (err) {
    console.error("START WATCH ERROR:", err);
    return res.status(500).json({ message: "Failed to start watch session" });
  }
});

router.post("/tasks/watch/:watchId/heartbeat", userAuth, async (req, res) => {
  try {
    const { visibilityHidden } = req.body || {};

    const watch = await TaskWatch.findById(req.params.watchId);
    if (!watch) return res.status(404).json({ message: "Watch session not found" });
    if (String(watch.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (watch.status !== "active") {
      return res.status(400).json({ message: "Session not active" });
    }

    // visibility abuse
    if (visibilityHidden === true) {
      watch.visibilityBreaks += 1;
      watch.suspicious = true;
    }

    // ✅ increment watched seconds
    watch.watchedSeconds += 1;
    watch.lastHeartbeatAt = new Date();
    watch.heartbeatCount += 1;

    await watch.save();

    return res.json({
      ok: true,
      watchedSeconds: watch.watchedSeconds,
      requiredSeconds: watch.requiredSeconds,
    });
  } catch (err) {
    return res.status(500).json({ message: "Heartbeat failed" });
  }
});



router.post("/tasks/:taskId/complete", userAuth, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { watchId } = req.body || {};
    if (!watchId) return res.status(400).json({ message: "watchId required" });

    await session.withTransaction(async () => {
      const user = await User.findById(req.user.id).session(session);
      if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
      if (isBlocked(user)) throw Object.assign(new Error("Account blocked"), { status: 403 });

      const task = await Task.findById(req.params.taskId).session(session);
      if (!task || !task.isActive) throw Object.assign(new Error("Task not found"), { status: 404 });

      const watch = await TaskWatch.findById(watchId).session(session);
      if (!watch) {
        await addStrike(user._id, "complete_without_watchId");
        throw Object.assign(new Error("Invalid watch session"), { status: 400 });
      }

      if (String(watch.userId) !== String(user._id) || String(watch.taskId) !== String(task._id)) {
        await addStrike(user._id, "watch_mismatch");
        throw Object.assign(new Error("Invalid watch session"), { status: 403 });
      }

      if (watch.status !== "active") {
        await addStrike(user._id, "reuse_or_expired_watch");
        throw Object.assign(new Error("Watch session expired"), { status: 400 });
      }

      // ✅ Heartbeat required
      const now = new Date();
      const last = new Date(watch.lastHeartbeatAt || 0);
      const secondsSinceHeartbeat = (now - last) / 1000;
      if (secondsSinceHeartbeat > 6) {
        watch.suspicious = true;
        await watch.save({ session });
        await addStrike(user._id, "heartbeat_missing");
        throw Object.assign(new Error("Video must stay active (do not minimize). Try again."), {
          status: 400,
        });
      }

      // ✅ Time check
      if (now < new Date(watch.canCompleteAt)) {
        watch.suspicious = true;
        await watch.save({ session });
        await addStrike(user._id, "completed_too_fast");
        throw Object.assign(new Error(`You must watch at least ${watch.requiredSeconds}s`), { status: 400 });
      }

      // daily limits
      ensureUserTasks(user);

      const alreadyDone = user.tasks.completedTaskIds.map(String).includes(String(task._id));
      if (alreadyDone) throw Object.assign(new Error("Task already completed"), { status: 400 });

      const pkg = user.packageId
        ? await Package.findById(user.packageId).select("maxDailyTasks isActive").session(session)
        : null;

      if (!pkg || !pkg.isActive) throw Object.assign(new Error("Package missing/inactive"), { status: 400 });

      const max = Number(pkg.maxDailyTasks || 0);
      const completed = Number(user.tasks.completedToday || 0);
      if (completed >= max) throw Object.assign(new Error(`Daily limit reached (${max})`), { status: 400 });

      // ✅ reward
      const reward = Number(task.reward || 0);
      if (!user.wallet) user.wallet = { balance: 0, totalEarned: 0 };

      // ✅ Mark watch completed + watched seconds final
      watch.status = "completed";
      watch.completedAt = now;
      watch.watchedSeconds = Math.max(Number(watch.requiredSeconds || 0), Number(watch.watchedSeconds || 0));
      watch.rewardEarned = reward;

      // ✅ CREDIT USER wallet
      user.wallet.balance = Number((Number(user.wallet.balance || 0) + reward).toFixed(2));
      user.wallet.totalEarned = Number((Number(user.wallet.totalEarned || 0) + reward).toFixed(2));

      // ✅ Task completion counters
      user.tasks.completedToday = completed + 1;
      user.tasks.completedTaskIds.push(task._id);

      // ✅ Create one income record for USER TASK earning (eventId = watch._id)
      await IncomeHistory.create(
        [
          {
            userId: user._id,
            fromUserId: user._id,
            eventId: watch._id,
            type: "task_reward",
            taskId: task._id,
            watchId: watch._id,
            baseAmount: reward,
            percent: 0,
            amount: reward,
            note: "Task reward credited",
          },
        ],
        { session }
      );

      // ✅ Referral % rules for TASK earnings
      const defaultRules = { level1: 10, level2: 5, level3: 3 };
      const settings = await Settings.findOne().lean();
      const rules = settings?.referralTaskCommission || defaultRules;

      // find uplines (L1->L3)
      const l1 = user?.referral?.referredBy || null;
      let l2 = null;
      let l3 = null;

      if (l1) {
        const l1User = await User.findById(l1).select("referral.referredBy referral.blocked referral.approved").session(session);
        if (l1User && !l1User.referral?.blocked && l1User.referral?.approved !== false) {
          l2 = l1User?.referral?.referredBy || null;

          if (l2) {
            const l2User = await User.findById(l2).select("referral.referredBy referral.blocked referral.approved").session(session);
            if (l2User && !l2User.referral?.blocked && l2User.referral?.approved !== false) {
              l3 = l2User?.referral?.referredBy || null;
            }
          }
        }
      }

      // helper to pay referral commission per task
      const payTaskCommission = async (toUserId, level, percent) => {
        if (!toUserId) return;
        if (String(toUserId) === String(user._id)) return;

        const upline = await User.findById(toUserId).session(session);
        if (!upline) return;

        if (upline.referral?.blocked) return;
        if (upline.referral?.approved === false) return;

        if (!upline.wallet) upline.wallet = { balance: 0, totalEarned: 0 };

        const p = Number(percent || 0);
        const commission = Number(((reward * p) / 100).toFixed(2));
        if (commission <= 0) return;

        // ✅ record income history for upline (eventId same watch._id)
        await IncomeHistory.create(
          [
            {
              userId: upline._id,
              fromUserId: user._id,
              eventId: watch._id,
              type: "referral_task_commission",
              level,
              taskId: task._id,
              watchId: watch._id,
              baseAmount: reward,
              percent: p,
              amount: commission,
              note: `Referral task commission L${level}`,
            },
          ],
          { session }
        );

        // ✅ credit wallet
        upline.wallet.balance = Number((Number(upline.wallet.balance || 0) + commission).toFixed(2));
        upline.wallet.totalEarned = Number((Number(upline.wallet.totalEarned || 0) + commission).toFixed(2));

        // optional analytics
        if (upline.referral) {
          upline.referral.totalCommission = Number(
            (Number(upline.referral.totalCommission || 0) + commission).toFixed(2)
          );
        }

        await upline.save({ session });
      };

      if (l1) await payTaskCommission(l1, 1, rules.level1 ?? 10);
      if (l2) await payTaskCommission(l2, 2, rules.level2 ?? 5);
      if (l3) await payTaskCommission(l3, 3, rules.level3 ?? 3);

      await watch.save({ session });
      await user.save({ session });

      res.json({
        message: "Task completed + reward + referral commissions processed",
        reward,
        balance: user.wallet.balance,
        completedToday: user.tasks.completedToday,
        maxDailyTasks: max,
        strikes: user.cheat?.strikes || 0,
      });
    });
  } catch (err) {
    console.error("TASK COMPLETE ERROR:", err);
    const status = err?.status || 500;

    // If duplicate income record happens, do NOT double pay
    if (err?.code === 11000) {
      return res.status(200).json({ message: "Already processed (duplicate prevented)" });
    }

    return res.status(status).json({ message: err.message || "Task completion failed" });
  } finally {
    session.endSession();
  }
});


router.get("/income-history", userAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const list = await IncomeHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(300)
      .populate("fromUserId", "email")
      .populate("taskId", "title reward")
      .lean();

    const agg = await IncomeHistory.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    res.json({
      totalEarned: agg[0]?.total || 0,
      totalRecords: agg[0]?.count || 0,
      history: list,
    });
  } catch (err) {
    console.error("INCOME HISTORY ERROR:", err);
    res.status(500).json({ message: "Failed to load income history" });
  }
});

// GET /api/user/activity-logs
// returns: deposits + withdrawals + totals

router.get("/activity-logs", userAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [deposits, withdrawals] = await Promise.all([
      Deposit.find({ userId }).sort({ createdAt: -1 }).lean(),
      Withdrawal.find({ userId }).sort({ createdAt: -1 }).lean(),
    ]);

    const totalDeposited = deposits
      .filter((d) => d.status === "completed")
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);

    const totalWithdrawn = withdrawals
      .filter((w) => w.status === "paid")
      .reduce((sum, w) => sum + Number(w.requestedAmount || 0), 0);

    res.json({
      totals: {
        totalDeposited,
        totalWithdrawn,
        net: totalDeposited - totalWithdrawn,
      },
      deposits,
      withdrawals,
    });
  } catch (err) {
    console.error("ACTIVITY LOGS ERROR:", err);
    res.status(500).json({ message: "Failed to load activity logs" });
  }
});

// GET /api/user/task-history
router.get("/task-history", userAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ history rows (include needed fields)
    const list = await TaskWatch.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .select(
        "taskId status requiredSeconds watchedSeconds rewardEarned startedAt completedAt createdAt"
      )
      .populate("taskId", "title reward provider watchSeconds videoUrl")
      .lean();

    // ✅ totals MUST come from rewardEarned (not from Task.reward)
    const totalAgg = await TaskWatch.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$rewardEarned" },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.json({
      totalEarned: totalAgg[0]?.total || 0,
      totalCompleted: totalAgg[0]?.count || 0,
      history: list,
    });
  } catch (err) {
    console.error("TASK HISTORY ERROR:", err);
    return res.status(500).json({ message: "Failed to load task history" });
  }
});

// GET /api/user/referrals
router.get("/referrals", userAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await Settings.findOne().lean();
    const levelRules = settings?.referralCommission || { level1: 10, level2: 5, level3: 2 };

    // total profit
    const totalProfitAgg = await ReferralCommission.aggregate([
      { $match: { toUserId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalProfit = totalProfitAgg[0]?.total || 0;

    // history
    const history = await ReferralCommission.find({ toUserId: userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("fromUserId", "email")
      .lean();

    // ✅ Referral tree using NEW schema field: referral.referredBy
    const level1Users = await User.find({ "referral.referredBy": userId })
      .select("email createdAt")
      .lean();

    const level1Ids = level1Users.map((u) => u._id);

    const level2Users = level1Ids.length
      ? await User.find({ "referral.referredBy": { $in: level1Ids } })
          .select("email createdAt")
          .lean()
      : [];

    const level2Ids = level2Users.map((u) => u._id);

    const level3Users = level2Ids.length
      ? await User.find({ "referral.referredBy": { $in: level2Ids } })
          .select("email createdAt")
          .lean()
      : [];

    res.json({
      levelRules,
      totalProfit,
      history,
      counts: {
        level1: level1Users.length,
        level2: level2Users.length,
        level3: level3Users.length,
      },
      users: {
        level1: level1Users,
        level2: level2Users,
        level3: level3Users,
      },
    });
  } catch (err) {
    console.error("REFERRALS ERROR:", err);
    res.status(500).json({ message: "Failed to load referrals" });
  }
});

// GET /api/user/leaderboard/referrals
router.get("/leaderboard/referrals", userAuth, async (req, res) => {
  try {
    const top = await ReferralCommission.aggregate([
      { $group: { _id: "$toUserId", profit: { $sum: "$amount" }, totalEvents: { $sum: 1 } } },
      { $sort: { profit: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$user._id",
          email: "$user.email",
          profit: 1,
          totalEvents: 1,
        },
      },
    ]);

    res.json(top);
  } catch (err) {
    console.error("LEADERBOARD ERROR:", err);
    res.status(500).json({ message: "Failed to load leaderboard" });
  }
});


// GET /api/user/referrals/tree
// GET /api/user/referrals/tree
router.get("/referrals/tree", userAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // referral commission rules
    const settings = await Settings.findOne().lean();
    const levelRules = settings?.referralCommission || { level1: 10, level2: 5, level3: 2 };

    // total profit from ReferralCommission collection
    const totalAgg = await ReferralCommission.aggregate([
      { $match: { toUserId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalProfit = totalAgg?.[0]?.total || 0;

    // ✅ LEVEL 1
    const level1Users = await User.find({ "referral.referredBy": userId })
      .select("email packageId levelRank levelName createdAt packageActivatedAt")
      .populate("packageId", "name levelRank")
      .lean();

    // ✅ LEVEL 2
    const level1Ids = level1Users.map((u) => u._id);
    const level2Users = level1Ids.length
      ? await User.find({ "referral.referredBy": { $in: level1Ids } })
          .select("email packageId levelRank levelName createdAt packageActivatedAt")
          .populate("packageId", "name levelRank")
          .lean()
      : [];

    // ✅ LEVEL 3
    const level2Ids = level2Users.map((u) => u._id);
    const level3Users = level2Ids.length
      ? await User.find({ "referral.referredBy": { $in: level2Ids } })
          .select("email packageId levelRank levelName createdAt packageActivatedAt")
          .populate("packageId", "name levelRank")
          .lean()
      : [];

    return res.json({
      levelRules,
      totalProfit,
      referrals: {
        level1: level1Users,
        level2: level2Users,
        level3: level3Users,
      },
    });
  } catch (err) {
    console.error("REFERRALS TREE ERROR:", err);
    return res.status(500).json({ message: "Failed to load referral tree" });
  }
});

router.post("/change-password", userAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    res.status(500).json({ message: "Failed to change password" });
  }
});

// GET /api/user/notices  (user can see all active notices)
router.get("/notices", userAuth, async (req, res) => {
  try {
    const now = new Date();

    const list = await Notice.find({
      isActive: true,
      $and: [
        { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
        { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ notices: list });
  } catch (err) {
    console.error("NOTICES ERROR:", err);
    return res.status(500).json({ message: "Failed to load notices" });
  }
});

const userController = require("../controllers/userController");

// ✅ wallet + profile features
router.get("/wallet", userAuth, userController.getWallet);
router.get("/referral-link", userAuth, userController.getReferralLink);

// ✅ withdrawal (this fixes “withdraw not working”)
router.post("/withdrawal/request", userAuth, userController.requestWithdrawal);
router.get("/withdrawal/history", userAuth, userController.withdrawalHistory);

// ✅ transactions
router.get("/transactions", userAuth, userController.transactions);

// ✅ income reports
router.get("/income/daily", userAuth, userController.incomeDaily);
router.get("/income/monthly", userAuth, userController.incomeMonthly);
module.exports = router;
