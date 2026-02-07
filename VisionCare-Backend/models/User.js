const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    fullname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true },
    age: { type: Number, required: true },
    bloodgroup: { type: String, required: true },
    profession: { type: String, required: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
