// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ---------- helpers ----------
function genRefCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function createUniqueRefCode() {
  let code = genRefCode(6);
  while (await User.findOne({ "referral.code": code })) {
    code = genRefCode(6);
  }
  return code;
}

// @route POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const emailRaw = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const referralCodeInput = String(req.body?.referralCode || req.query?.ref || "")
      .trim()
      .toUpperCase();

    if (!emailRaw || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const exists = await User.findOne({ email: emailRaw });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));

    const myRefCode = await createUniqueRefCode();

    // find referrer (support new + old schema)
    let referrer = null;
    if (referralCodeInput) {
      referrer = await User.findOne({
        $or: [
          { "referral.code": referralCodeInput },
          { referralCode: referralCodeInput }, // old field support
        ],
      });

      // if referrer is blocked (safe check)
      if (referrer && referrer.referral && referrer.referral.blocked === true) {
        referrer = null;
      }
    }

    // create user
    const user = await User.create({
      email: emailRaw,
      password: hashedPassword,
      referral: {
        code: myRefCode,
        referredBy: referrer ? referrer._id : null,
        approved: true,
        blocked: false,
        count: 0,
        totalCommission: 0,
      },
      wallet: { balance: 0, totalEarned: 0 },
    });

    // optional register bonus
    if (referrer) {
      const bonus = Number(process.env.REFERRAL_BONUS || 0);

      // ensure wallet exists
      if (!referrer.wallet) referrer.wallet = { balance: 0, totalEarned: 0 };

      // ensure referral object exists (old users safety)
      if (!referrer.referral) {
        referrer.referral = {
          code: undefined,
          referredBy: null,
          approved: true,
          blocked: false,
          count: 0,
          totalCommission: 0,
        };
      }

      // count referral
      referrer.referral.count = Number(referrer.referral.count || 0) + 1;

      // add bonus if enabled
      if (bonus > 0) {
        referrer.wallet.balance = Number(referrer.wallet.balance || 0) + bonus;
        referrer.wallet.totalEarned = Number(referrer.wallet.totalEarned || 0) + bonus;
      }

      await referrer.save();
    }

    return res.status(201).json({
      message: "User registered successfully",
      referralCode: myRefCode,
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: err?.message || "Server error" });
  }
});

// @route POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const payload = { id: user._id.toString(), role: user.role || "user" };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role || "user",
        referralCode: (user.referral && user.referral.code) ? user.referral.code : "",
        referralCount: (user.referral && Number.isFinite(Number(user.referral.count))) ? Number(user.referral.count) : 0,
        wallet: user.wallet || { balance: 0, totalEarned: 0 },
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
