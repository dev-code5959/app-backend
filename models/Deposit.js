const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        // Changed to 'User' to match the standard User model registration
        ref: 'User', 
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true
    },
    transactionHash: {
        type: String,
        required: true
    },
    receiptImage: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'pending', // pending, completed, rejected
        enum: ['pending', 'completed', 'rejected']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});
DepositSchema.index({ userId: 1, createdAt: -1 });
DepositSchema.index({ status: 1, createdAt: -1 });
// Using 'Deposit' (Capitalized) is standard practice for Mongoose models
module.exports = mongoose.model('Deposit', DepositSchema);