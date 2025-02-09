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

// ✅ Predefined amount (replace this with your amount)
const predefinedAmount = 500; // Example: 500 INR

// ✅ Helper function to generate QR code
const generateQRCode = (upiLink) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
};

// ✅ Async error handler middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ✅ Create Order & Generate UPI Payment Link
app.post("/create-order", asyncHandler(async (req, res) => {
    const amount = predefinedAmount;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount specified" });
    }

    // ✅ Create Razorpay Order
    const options = {
        amount: amount * 100, // Amount in paise
        currency: "INR",
        receipt: "order_" + Date.now(),
        payment_capture: 1, // Auto capture
    };

    const order = await razorpay.orders.create(options);

    // ✅ Generate UPI Payment Link
    const upiPaymentLink = `upi://pay?pa=${process.env.UPI_ID}&pn=${encodeURIComponent("VEND MASTER")}&tn=${encodeURIComponent("Vending Machine Payment")}&am=${amount}&cu=INR`;

    // ✅ Generate QR Code for UPI Payment
    const qrCodeURL = generateQRCode(upiPaymentLink);

    console.log(`✅ Order Created: ${order.id}`);

    // ✅ Send order details, UPI link & QR code
    res.json({
        success: true,
        order_id: order.id,
        upiPaymentLink,
        qrCodeURL,
    });
}));

// ✅ Verify and Capture Payment (On-Demand Verification)
app.post("/verify-payment", asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Missing payment details" });
    }

    // ✅ Verify payment signature
    const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET_KEY)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");

    if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ error: "Invalid payment signature" });
    }

    // ✅ Fetch payment details from Razorpay
    console.log(`🔍 Checking payment details for Payment ID: ${razorpay_payment_id}`);

    const paymentDetails = await axios.get(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        {
            auth: {
                username: process.env.RAZORPAY_KEY_ID,
                password: process.env.RAZORPAY_SECRET_KEY,
            },
        }
    );

    console.log("📝 Payment Details Response:", paymentDetails.data);

    const payment = paymentDetails.data;
    const paymentStatus = payment.status;

    if (paymentStatus === "captured") {
        return res.json({
            success: true,
            status: "Success",
            message: "Payment Captured Successfully!",
            payment_id: razorpay_payment_id,
        });
    } else {
        return res.json({
            success: false,
            status: paymentStatus,
            message: "Payment Pending or Failed!",
        });
    }
}));

// ✅ Webhook for Automatic Payment Capture
app.post("/webhook", asyncHandler(async (req, res) => {
    const payload = req.body;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    console.log("🔔 Webhook triggered:", payload.event);

    // Generate Expected Signature
    const generatedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(payload))
        .digest("hex");

    if (signature !== generatedSignature) {
        console.warn("❌ Invalid Webhook Signature");
        return res.status(400).json({ error: "Invalid signature" });
    }

    // Check for payment.captured event
    if (payload.event === "payment.captured") {
        const paymentId = payload.payload.payment.entity.id;
        console.log(`✅ Payment Captured via Webhook: ${paymentId}`);
        // Here, you can mark the payment as successful in your system
        return res.json({ status: "success" });
    }

    res.status(400).json({ error: "Unhandled webhook event" });
}));

// ✅ Get Order Status
app.get("/order-status/:orderId", asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await razorpay.orders.fetch(orderId);
    res.json({ success: true, order });
}));

// ✅ Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("❌ Server Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
