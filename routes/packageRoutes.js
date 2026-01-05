const express = require('express');
const router = express.Router(); // This must be a function
const Package = require('../models/Package');

// GET /api/packages
router.get('/', async (req, res) => {
    try {
        const packages = await Package.find();
        res.json(packages);
    } catch (err) {
        res.status(500).json({ msg: "Server Error" });
    }
});

module.exports = router; // This is what line 20 in server.js needs!