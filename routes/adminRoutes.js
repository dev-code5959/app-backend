const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const User = require('../models/User'); // Path to your User model

// A. MANUAL RESET (Admin Route)
exports.resetTasksManual = async (req, res) => {
    try {
        // Sets 'tasksCompleted' (or your equivalent field) to 0 for everyone
        await User.updateMany({}, { $set: { "tasks.completedToday": 0, "tasks.lastReset": new Date() } });
        res.status(200).json({ message: "Global tasks reset successful" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// B. AUTOMATIC RESET (Cron Job)
// Runs every night at 00:00 (Midnight)
cron.schedule('0 0 * * *', async () => {
    try {
        console.log('--- SYSTEM: STARTING AUTOMATIC DAILY TASK RESET ---');
        await User.updateMany({}, { 
            $set: { 
                "tasks.completedToday": 0,
                "tasks.lastReset": new Date()
            } 
        });
        console.log('--- SYSTEM: DAILY RESET COMPLETED ---');
    } catch (error) {
        console.error('CRON ERROR:', error);
    }
});
// GET /api/admin/settings/crypto
router.get('/settings/crypto', async (req, res) => {
    try {
        // Replace with your real addresses
        res.json({
            usdt: "0xYourUsdtAddress...",
            btc: "1YourBtcAddress...",
            ltc: "LYourLtcAddress..."
        });
    } catch (err) {
        res.status(500).json({ msg: "Server Error" });
    }
});

module.exports = router;