require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// ✅ Helper function to generate QR Code for Razorpay Payment Link
const generateQRCode = (paymentLink) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentLink)}`;
};

// ✅ Async error handler middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ✅ Create Order & Generate Razorpay Payment Link with QR Code
app.post("/create-order", asyncHandler(async (req, res) => {
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount specified" });
    }

    // ✅ Create Payment Link (Best for QR Code Payments)
    const paymentLinkOptions = {
        amount: amount * 100, // Amount in paise
        currency: "INR",
        description: "Payment for your order",
        customer: {
            name: "Customer Name",
            contact: "9999999999",  // Replace with actual phone number
            email: "customer@example.com" // Replace with actual email
        },
        expire_by: Math.floor(Date.now() / 1000) + 900, // Expiry time (15 minutes)
        notify: { sms: true, email: true },
        reminder_enable: true,
        callback_url: "https://vend-master.onrender.com/payment-success", // Replace with actual frontend URL
        callback_method: "get"
    };

    const paymentLink = await razorpay.paymentLink.create(paymentLinkOptions);

    // ✅ Generate QR Code for Payment Link
    const qrCodeURL = generateQRCode(paymentLink.short_url);

    console.log(`✅ Payment Link Created: ${paymentLink.short_url}`);

    res.json({
        success: true,
        order_id: paymentLink.id,
        paymentLink: paymentLink.short_url,
        qrCodeURL,
    });
}));

// ✅ Webhook for Automatic Payment Capture
app.post("/webhook", express.json(), asyncHandler(async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const payload = JSON.stringify(req.body);

    console.log("🔔 Webhook Event Received:", req.body.event);

    // ✅ Verify Webhook Signature
    const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

    if (signature !== expectedSignature) {
        console.warn("❌ Invalid Webhook Signature");
        return res.status(400).json({ error: "Invalid signature" });
    }

    // ✅ Process Webhook Events
    const event = req.body.event;
    const paymentId = req.body.payload.payment.entity.id;

    if (event === "payment.captured") {
        console.log(`✅ Payment Captured: ${paymentId}`);
        return res.json({ success: true, message: "Payment captured successfully" });
    } else if (event === "payment.failed") {
        console.warn(`❌ Payment Failed: ${paymentId}`);
        return res.json({ success: false, message: "Payment failed" });
    }

    res.status(400).json({ error: "Unhandled webhook event" });
}));

// ✅ Get Order Status (For Frontend Polling)
app.get("/order-status/:orderId", asyncHandler(async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await razorpay.paymentLink.fetch(orderId);

        res.json({
            success: true,
            order_status: order.status,  // Returns 'paid', 'expired', or 'pending'
            order,
        });
    } catch (error) {
        console.error("❌ Error Fetching Order Status:", error.message);
        res.status(400).json({ error: "Invalid Order ID" });
    }
}));

// ✅ Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("❌ Server Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
