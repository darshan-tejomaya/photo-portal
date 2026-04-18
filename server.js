const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔐 ENV VARIABLES
const FAST2SMS_API_KEY = process.env.API_KEY;
const DRIVE_LINK = process.env.DRIVE_LINK || "YOUR_GOOGLE_DRIVE_LINK";

// ⏱ OTP expiry (5 min)
const OTP_EXPIRY_MS = 5 * 60 * 1000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Load students
const students = require("./students.json");

// Store OTPs
const otpStore = new Map();


// 📌 Format phone number
function formatPhone(phone) {
  if (!phone) return null;
  phone = phone.replace(/\D/g, "");

  if (phone.length === 10) return "91" + phone;
  if (phone.startsWith("91") && phone.length === 12) return phone;

  return null;
}

// 📌 Find student
function findStudent(phone) {
  return students.find(s => s.phone === phone);
}


// 🔹 ROOT ROUTE (FIXES "Cannot GET /")
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// 🔹 GET STUDENT NAME
app.post("/get-student", (req, res) => {
  const phone = formatPhone(req.body.phone);

  if (!phone) {
    return res.status(400).json({ message: "Invalid phone number" });
  }

  const student = findStudent(phone);

  if (!student) {
    return res.status(404).json({ message: "Not registered" });
  }

  res.json({ name: student.name });
});


// 🔹 SEND OTP
app.post("/send-otp", async (req, res) => {
  const phone = formatPhone(req.body.phone);

  if (!phone) {
    return res.status(400).json({ message: "Invalid phone number" });
  }

  const student = findStudent(phone);

  if (!student) {
    return res.status(403).json({ message: "Access denied" });
  }

  const otp = Math.floor(1000 + Math.random() * 9000);

  otpStore.set(phone, {
    otp,
    expiry: Date.now() + OTP_EXPIRY_MS,
    attempts: 0
  });

  try {
    await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: FAST2SMS_API_KEY,
        route: "dlt",
        sender_id: "CSAMLR",
        message: "204699",
        variables_values: otp,
        numbers: phone
      }
    });

    res.json({ message: "OTP sent" });

  } catch (error) {
    console.error("SMS ERROR:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});


// 🔹 VERIFY OTP
app.post("/verify-otp", (req, res) => {
  const phone = formatPhone(req.body.phone);
  const otp = req.body.otp;

  if (!phone || !otp) {
    return res.status(400).json({ message: "Missing data" });
  }

  const record = otpStore.get(phone);

  if (!record) {
    return res.status(400).json({ message: "OTP not requested" });
  }

  if (Date.now() > record.expiry) {
    otpStore.delete(phone);
    return res.status(400).json({ message: "OTP expired" });
  }

  if (record.attempts >= 3) {
    otpStore.delete(phone);
    return res.status(403).json({ message: "Too many attempts" });
  }

  if (String(record.otp) === String(otp)) {
    otpStore.delete(phone);

    return res.json({
      success: true,
      link: DRIVE_LINK
    });
  }

  record.attempts += 1;
  res.status(400).json({ message: "Invalid OTP" });
});


// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
