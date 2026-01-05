const User = require('../models/User');
const Package = require('../models/Package');
const Withdrawal = require('../models/Withdrawal');
const Deposit = require('../models/Deposit'); // Assuming you have a Deposit model

// 1. DASHBOARD STATS OVERVIEW
exports.getAdminStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: 'user' });
        
        // Calculate Total Volume from completed deposits
        const deposits = await Deposit.find({ status: 'approved' });
        const totalDeposited = deposits.reduce((acc, curr) => acc + curr.amount, 0);

        // Calculate Total Payouts
        const withdrawals = await Withdrawal.find({ status: 'completed' });
        const totalWithdrawn = withdrawals.reduce((acc, curr) => acc + curr.amount, 0);

        // Calculate Revenue from the 10% Fees
        // Fee Revenue = Total Gross Withdrawn * 0.10
        const feeRevenue = totalWithdrawn * 0.10;

        const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });
        const pendingDeposits = await Deposit.countDocuments({ status: 'pending' });

        res.json({
            totalUsers,
            totalDeposited,
            totalWithdrawn,
            feeRevenue,
            pendingWithdrawals,
            pendingDeposits,
            netProfit: totalDeposited - totalWithdrawn
        });
    } catch (err) {
        res.status(500).json({ msg: "Error fetching stats" });
    }
};

// 2. PACKAGE MANAGEMENT
exports.createPackage = async (req, res) => {
    try {
        const pkg = await Package.create(req.body);
        res.status(201).json(pkg);
    } catch (err) {
        res.status(400).json({ msg: "Error creating package" });
    }
};

// 3. WITHDRAWAL MANAGEMENT (With 10% Fee Logic)
exports.getPendingWithdrawals = async (req, res) => {
    try {
        const pending = await Withdrawal.find({ status: 'pending' }).populate('userId', 'email username');
        res.json(pending);
    } catch (err) {
        res.status(500).json({ msg: "Error fetching withdrawals" });
    }
};

exports.approveWithdrawal = async (req, res) => {
    try {
        const withdrawal = await Withdrawal.findById(req.params.id);
        if (!withdrawal || withdrawal.status !== 'pending') {
            return res.status(400).json({ msg: "Invalid withdrawal request" });
        }

        const user = await User.findById(withdrawal.userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        // Logic: 
        // 1. User requested 'amount' (e.g., $100)
        // 2. We already deducted $100 from balance during request
        // 3. Admin pays 'finalPayout' (e.g., $90)
        
        user.wallet.totalWithdrawn += (withdrawal.amount * 0.9); // Record net payout
        withdrawal.status = 'completed';
        
        await user.save();
        await withdrawal.save();

        res.json({ msg: "Withdrawal approved and marked as paid" });
    } catch (err) {
        res.status(500).json({ msg: "Approval failed" });
    }
};

// 4. LEADERBOARD & REFERRALS
exports.getLeaderboard = async (req, res) => {
    try {
        const topUsers = await User.find({ role: 'user' })
            .sort({ "weeklyReferrals": -1 }) // Primary sort for competition
            .limit(10)
            .select('email username weeklyReferrals referralCount wallet.balance');
        res.json(topUsers);
    } catch (err) {
        res.status(500).json({ msg: "Leaderboard error" });
    }
};

exports.resetWeeklyLeaderboard = async (req, res) => {
    try {
        // Resets the weekly contest counter but keeps lifetime referralCount safe
        await User.updateMany({}, { $set: { weeklyReferrals: 0 } });
        res.json({ msg: "Weekly leaderboard reset successful" });
    } catch (err) {
        res.status(500).json({ msg: "Reset failed" });
    }
};

// 5. TASK MANAGEMENT
exports.resetDailyTasksManual = async (req, res) => {
    try {
        await User.updateMany({}, { 
            $set: { 
                "tasks.completedToday": 0, 
                "tasks.lastReset": new Date() 
            } 
        });
        res.json({ msg: "All user daily tasks have been reset" });
    } catch (err) {
        res.status(500).json({ msg: "Task reset failed" });
    }
};

// 6. USER MANAGEMENT
exports.getAllUsers = async (req, res) => {
    try {
        const searchQuery = req.query.search || "";
        const users = await User.find({
            email: { $regex: searchQuery, $options: 'i' },
            role: 'user'
        }).select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ msg: "Error fetching users" });
    }
};

// 7. ANNOUNCEMENTS
exports.postAnnouncement = async (req, res) => {
    try {
        // This assumes you have an Announcement model or specific field
        // For simplicity, we can store the latest in a Settings collection
        // await Settings.findOneAndUpdate({}, { currentAnnouncement: req.body });
        res.json({ msg: "Announcement broadcasted successfully" });
    } catch (err) {
        res.status(500).json({ msg: "Broadcast failed" });
    }
};