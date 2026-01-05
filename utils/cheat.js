// utils/cheat.js
const User = require("../models/User");

const STRIKE_LIMIT = Number(process.env.CHEAT_STRIKE_LIMIT || 5);
const BLOCK_MINUTES = Number(process.env.CHEAT_BLOCK_MINUTES || 1440); // 1 day

async function addStrike(userId, reason = "suspicious") {
  const user = await User.findById(userId);
  if (!user) return;

  user.cheat = user.cheat || {};
  user.cheat.strikes = Number(user.cheat.strikes || 0) + 1;
  user.cheat.lastStrikeAt = new Date();

  // auto-block if reached limit
  if (user.cheat.strikes >= STRIKE_LIMIT) {
    const until = new Date(Date.now() + BLOCK_MINUTES * 60 * 1000);
    user.cheat.blockedUntil = until;
    // you can also disable referral earnings if you want:
    user.referralBlocked = true;
  }

  await user.save();
  return { strikes: user.cheat.strikes, blockedUntil: user.cheat.blockedUntil, reason };
}

function isBlocked(user) {
  const until = user?.cheat?.blockedUntil;
  return until && new Date(until) > new Date();
}

module.exports = { addStrike, isBlocked };
