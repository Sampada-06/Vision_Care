const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// SIGNUP
router.post("/signup", async (req, res) => {
    try {
        const { fullname, email, mobile, age, bloodgroup, profession, password } = req.body;

        const existing = await User.findOne({ email });
        if (existing) {
            return res.json({ status: "error", message: "Email already exists!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            fullname,
            email,
            mobile,
            age,
            bloodgroup,
            profession,
            password: hashedPassword
        });

        res.json({ status: "success", message: "Signup successful!" });
    } catch (error) {
        res.json({ status: "error", message: error.message });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ status: "error", message: "User not found!" });
        }

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) {
            return res.json({ status: "error", message: "Incorrect password!" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

        res.json({
            status: "success",
            message: "Login successful!",
            token,
            user: {
                fullname: user.fullname,
                email: user.email,
            }
        });
    } catch (error) {
        res.json({ status: "error", message: error.message });
    }
});

module.exports = router;
