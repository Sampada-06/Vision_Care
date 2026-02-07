require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// FIXED MONGODB CONNECTION
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("DB Connected"))
    .catch(err => console.error("DB Error:", err));

// ROUTES
app.use("/api/auth", require("./routes/auth"));
app.use("/api/history", require("./routes/history"));

app.listen(5000, () => {
    console.log("Server running on port 5000");
});
