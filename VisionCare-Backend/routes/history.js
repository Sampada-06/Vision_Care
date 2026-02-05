const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const History = require("../models/History");

// Token middleware
function authMiddleware(req, res, next) {
    const token = req.body.token;
    if (!token) return res.json({ status: "error", message: "Token missing" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.json({ status: "error", message: "Invalid token" });
    }
}

// SAVE TEST HISTORY
router.post("/save", authMiddleware, async (req, res) => {
    try {
        const { testName, result } = req.body;

        await History.create({
            user: req.userId,
            testName,
            result
        });

        res.json({ status: "success", message: "Saved to history!" });
    } catch (err) {
        res.json({ status: "error", message: err.message });
    }
});

// GET TEST HISTORY
router.post("/get", async (req, res) => {
    const { token } = req.body;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const history = await History.find({ user: decoded.id }).sort({ createdAt: -1 });

        res.json({ status: "success", history });
    } catch (err) {
        res.json({ status: "error", message: err.message });
    }
});

module.exports = router;
