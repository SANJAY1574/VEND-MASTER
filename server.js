require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors({ origin: "*" })); // Allow all origins for testing in a development environment
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Check if API Keys are Set
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY) {
    console.error("❌ ERROR: Missing Razorpay API Keys. Check your .env file.");
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

// ✅ Create Razorpay Order & Generate Payment Link with QR Code
app.post("/create-upi-payment", async (req, res) => {
    try {
        const { amount } = req.body;

        // Validate Amount
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount specified. Amount must be a positive number." });
        }

        console.log("🔹 Creating Razorpay payment for amount:", amount);

        // ✅ Create Razorpay Order
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            payment_capture: 1, // Auto-capture payment after success
        });

        console.log("✅ Razorpay Order Created:", order);

        // ✅ Generate Payment Link (Razorpay's Checkout page automatically handles payments)
        const paymentLink = `https://checkout.razorpay.com/v1/checkout.js?order_id=${order.id}`;

        console.log("✅ Razorpay Payment Link:", paymentLink);

        // ✅ Generate QR Code for Payment Link
        const qrCodeImage = qr.image(paymentLink, { type: "png" });
        const qrCodePath = path.join(qrCodeDir, `payment_qr_${Date.now()}.png`);
        
        const qrStream = fs.createWriteStream(qrCodePath);
        qrCodeImage.pipe(qrStream);

        qrStream.on("finish", () => {
            res.json({
                success: true,
                paymentLink,
                qrCodeUrl: `https://vend-master.onrender.com/qrcodes/${path.basename(qrCodePath)}`, // Replace with your IP address
            });
        });

        qrStream.on("error", (err) => {
            console.error("❌ Error writing QR code file:", err);
            res.status(500).json({ error: "Failed to generate QR code." });
        });

    } catch (error) {
        console.error("❌ Error creating Razorpay payment:", error.response?.data || error.message || error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Serve QR Code Images
app.use("/qrcodes", express.static(qrCodeDir));

// ✅ Webhook for Payment Verification
app.post("/razorpay-webhook", (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    let webhookBody = '';
    req.on('data', chunk => {
        webhookBody += chunk;
    });

    req.on('end', () => {
        const crypto = require('crypto');
        const expectedSignature = crypto.createHmac('sha256', webhookSecret)
            .update(webhookBody)
            .digest('hex');

        const actualSignature = req.headers['x-razorpay-signature'];

        if (expectedSignature === actualSignature) {
            const payload = JSON.parse(webhookBody);
            const paymentDetails = payload.payload.payment.entity;

            // Check if the payment is successful
            if (paymentDetails.status === 'captured') {
                console.log('✅ Payment captured:', paymentDetails);
                res.status(200).send('Payment received successfully');
            } else {
                console.log('❌ Payment failed');
                res.status(400).send('Payment verification failed');
            }
        } else {
            console.log('❌ Invalid signature');
            res.status(400).send('Invalid signature');
        }
    });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
