const express = require('express');
const router = express.Router();
const BranchManager = require('../models/BranchManager');

router.get('/add-money', async (req, res) => {
    try {
        const manager = await BranchManager.findOne();
        if (!manager) return res.send('No manager found');
        manager.walletBalance = (manager.walletBalance || 0) + 10000;
        await manager.save();
        res.send(`Money added. New balance: ${manager.walletBalance}`);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

module.exports = router;
