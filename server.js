require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image"); // QR Code generator
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Validate Environment Variables
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY || !process.env.UPI_RECIPIENT_ID) {
    console.error("❌ ERROR: Missing Razorpay API Keys or UPI ID. Check your .env file.");
    process.exit(1);
}

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// ✅ Ensure QR Code Directory Exists
const qrCodeDir = path.join(__dirname, "qrcodes");
if (!fs.existsSync(qrCodeDir)) {
    fs.mkdirSync(qrCodeDir);
}

// ✅ Create UPI Payment & Generate QR Code
app.post("/create-upi-payment", async (req, res) => {
    try {
        const { amount, phone, email } = req.body;

        // ✅ Validate Amount
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount specified. Amount must be a positive number." });
        }

        console.log("🔹 Creating UPI payment for amount:", amount);

        // ✅ Generate Razorpay Payment Link
        const paymentLink = await razorpay.paymentLink.create({
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            description: "Payment for Vending Machine",
            customer: {
                contact: phone || "9876543210", // Provide test contact if not given
                email: email || "test@example.com",
            },
            upi: {
                vpa: process.env.UPI_RECIPIENT_ID // Ensure it's a valid business UPI ID
            },
            callback_url: "https://yourwebsite.com/payment-success",
            callback_method: "get"
        });

        console.log("✅ Razorpay UPI Payment Link Created:", paymentLink.short_url);

        // ✅ Generate QR Code for Payment Link
        const qrCodeImage = qr.image(paymentLink.short_url, { type: "png" });
        const qrCodePath = path.join(qrCodeDir, `payment_qr_${Date.now()}.png`);

        const qrStream = fs.createWriteStream(qrCodePath);
        qrCodeImage.pipe(qrStream);

        qrStream.on("finish", () => {
            res.json({
                success: true,
                upiPaymentUrl: paymentLink.short_url,
                qrCodeUrl: `https://vend-master.onrender.com/qrcodes/${path.basename(qrCodePath)}`,
            });
        });

        qrStream.on("error", (err) => {
            console.error("❌ Error writing QR code file:", err);
            res.status(500).json({ error: "Failed to generate QR code." });
        });

    } catch (error) {
        console.error("❌ Error creating UPI payment:", error.response?.data || error.message || error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Serve QR Code Images
app.use("/qrcodes", express.static(qrCodeDir));

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
