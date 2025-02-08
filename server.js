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

// ✅ Function to generate QR Code for Payment
const generateQRCode = (paymentLink) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentLink)}`;
};

// ✅ Async error handler middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// ✅ Create Order & Generate Razorpay Payment Link
app.post("/create-order", asyncHandler(async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            console.log("❌ Invalid amount received:", amount);
            return res.status(400).json({ error: "Invalid amount specified" });
        }

        console.log("✅ Creating Razorpay Payment Link for:", amount);

        // ✅ Create Razorpay Payment Link
        const paymentLinkData = {
            amount: amount * 100, // Convert to paise
            currency: "INR",
            description: "Stationery Vending Payment",
            expire_by: Math.floor(Date.now() / 1000) + 600, // Expires in 10 mins
            reference_id: "txn_" + Date.now(),
            callback_url: "https://vend-master.onrender.com/payment-success",
            callback_method: "get",
        };

        const paymentLinkResponse = await razorpay.paymentLink.create(paymentLinkData);
        console.log("✅ Payment Link Created:", paymentLinkResponse);

        const qrCodeURL = generateQRCode(paymentLinkResponse.short_url);

        res.json({
            success: true,
            paymentLink: paymentLinkResponse.short_url, // ✅ Correct Razorpay Link
            qrCodeURL,
        });

    } catch (error) {
        console.error("❌ Error in /create-order:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}));


// ✅ Verify Payment and Capture
app.post("/verify-payment", asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
        console.error("❌ Error in /verify-payment:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}));

// ✅ Webhook for Automatic Payment Capture
app.post("/webhook", asyncHandler(async (req, res) => {
    try {
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

        // ✅ Process payment.captured event
        if (payload.event === "payment.captured") {
            const paymentId = payload.payload.payment.entity.id;
            console.log(`✅ Payment Captured via Webhook: ${paymentId}`);
            return res.json({ status: "success" });
        }

        res.status(400).json({ error: "Unhandled webhook event" });
    } catch (error) {
        console.error("❌ Error in /webhook:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
}));

// ✅ Get Order Status
app.get("/order-status/:orderId", asyncHandler(async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await razorpay.orders.fetch(orderId);
        res.json({ success: true, order });
    } catch (error) {
        console.error("❌ Error in /order-status:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
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
