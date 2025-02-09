require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

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

// ✅ Ensure QR Code Directory Exists
const qrCodeDir = path.join(__dirname, "qrcodes");
if (!fs.existsSync(qrCodeDir)) {
    fs.mkdirSync(qrCodeDir);
}

// ✅ Create Razorpay Order & Generate Payment QR Code
app.post("/create-upi-payment", async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount specified. Amount must be a positive number." });
        }

        console.log("🔹 Creating Razorpay Payment Link for amount:", amount);

        // ✅ Create Payment Link using Razorpay API
        const paymentLinkData = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            accept_partial: false,
            description: "Payment for vending machine purchase",
            customer: {
                name: "Customer Name",
                email: "customer@example.com",
                contact: "9876543210",
            },
            notify: {
                sms: true,
                email: true,
            },
            reminder_enable: true,
            expire_by: Math.floor(Date.now() / 1000) + 3600, // Link expires in 1 hour
            reference_id: "txn_" + Date.now(),
            callback_url: "https://vend-master.onrender.com/payment-success",
            callback_method: "get",
        };

        const paymentLink = await razorpay.paymentLink.create(paymentLinkData);

        console.log("✅ Razorpay Payment Link Created:", paymentLink);

        // ✅ Generate QR Code for Payment Link
        const qrCodeImage = qr.image(paymentLink.short_url, { type: "png" });
        const qrCodePath = path.join(qrCodeDir, `payment_qr_${Date.now()}.png`);

        const qrStream = fs.createWriteStream(qrCodePath);
        qrCodeImage.pipe(qrStream);

        qrStream.on("finish", () => {
            console.log("✅ QR Code successfully created:", qrCodePath);
            res.json({
                success: true,
                paymentLink: paymentLink.short_url,
                qrCodeUrl: `https://vend-master.onrender.com/qrcodes/${path.basename(qrCodePath)}`,
            });
        });

        qrStream.on("error", (err) => {
            console.error("❌ Error writing QR code file:", err);
            res.status(500).json({ error: "Failed to generate QR code." });
        });

    } catch (error) {
        console.error("❌ Error creating Razorpay Payment Link:", error.response?.data || error.message || error);
        res.status(500).json({ error: error.response?.data || "Internal Server Error" });
    }
});


// ✅ Serve QR Code Images
app.use("/qrcodes", express.static(qrCodeDir));

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
