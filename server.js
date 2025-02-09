require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image"); // For QR code generation
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Ensure QR Code Directory Exists
const qrCodeDir = path.join(__dirname, "qrcodes");
if (!fs.existsSync(qrCodeDir)) {
    fs.mkdirSync(qrCodeDir);
}

// ✅ Serve QR Code Directory Publicly
app.use("/qrcodes", express.static(qrCodeDir));

// ✅ Check if API Keys are Set
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY) {
    console.error("❌ ERROR: Razorpay API Keys are missing. Check your .env file.");
    process.exit(1);
}

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// ✅ Create Payment Link & Generate QR Code
app.post("/create-payment-link", async (req, res) => {
    try {
        const { amount } = req.body;

        // Validate Amount
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount specified. Amount must be a positive number." });
        }

        console.log("🔹 Creating payment link for amount:", amount);

        // ✅ Create Razorpay Payment Link
        const paymentLink = await razorpay.paymentLink.create({
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            description: "Vending Machine Payment",
            customer: {
                name: "Customer",
                email: "customer@example.com",
                contact: "9999999999",
            },
            notify: {
                sms: true,
                email: true,
            },
            callback_url: "qwerty://payment-success", // Redirect after payment
            callback_method: "get",
        });

        console.log("✅ Payment Link Created:", paymentLink.short_url);

        // ✅ Generate QR Code for the Payment Link
        const qrFileName = `payment_qr_${Date.now()}.png`;
        const qrCodePath = path.join(qrCodeDir, qrFileName);
        const qrCodeUrl = `https://vend-master.onrender.com/qrcodes/${qrFileName}`; // 🔹 Public URL for Flutter

        const qrStream = fs.createWriteStream(qrCodePath);
        qr.image(paymentLink.short_url, { type: "png" }).pipe(qrStream);

        qrStream.on("finish", () => {
            console.log("✅ QR Code Saved:", qrCodeUrl);
            res.json({
                success: true,
                paymentLink: paymentLink.short_url,
                qrCodeUrl, // ✅ Public URL instead of local path
            });
        });

        qrStream.on("error", (err) => {
            console.error("❌ Error writing QR code file:", err);
            res.status(500).json({ error: "Failed to generate QR code." });
        });

    } catch (error) {
        console.error("❌ Error creating payment link:", error.response?.data || error.message || error);
        res.status(500).json({ error: error.response?.data || "Internal Server Error" });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
