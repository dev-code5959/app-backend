const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    // Crypto Addresses
    usdtAddress: String,
    btcAddress: String,
    ltcAddress: String,
    
    // Referral Commissions
    referralCommission: {
        level1: { type: Number, default: 10 }, // 10%
        level2: { type: Number, default: 5 },  // 5%
        level3: { type: Number, default: 2 }   // 2%
    },
      // ✅ SYSTEM CONTROL FLAGS
    tasksDisabled: { type: Boolean, default: false },
    offday: { type: Boolean, default: false },
    withdrawalsDisabled: { type: Boolean, default: false },
    lastResetAt: { type: Date, default: null },
    // Platform toggles
    withdrawalsEnabled: { type: Boolean, default: true }
});

module.exports = mongoose.model('Settings', settingsSchema);