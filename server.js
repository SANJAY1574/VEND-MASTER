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

// ✅ Function to Generate QR Code for UPI Payment
const generateQRCode = (upiLink) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
};

// ✅ Create Order & Generate UPI Payment Link
app.post("/create-order", async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount) {
            return res.status(400).json({ error: "Amount is required" });
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
        const upiPaymentLink = `upi://pay?pa=vprabhasivashankarsk-1@oksbi&pn=${encodeURIComponent(
            "VEND MASTER"
        )}&tn=${encodeURIComponent("Vending Machine Payment")}&am=${amount}&cu=INR`;

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
    } catch (error) {
        console.error("❌ Error creating order:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

// ✅ Verify and Capture Payment
app.post("/verify-payment", async (req, res) => {
    try {
        const { razorpay_order_id } = req.body;

        if (!razorpay_order_id) {
            return res.status(400).json({ error: "Order ID is required" });
        }

        // ✅ Fetch payment details from Razorpay
        const paymentDetails = await axios.get(
            `https://api.razorpay.com/v1/orders/${razorpay_order_id}/payments`,
            {
                auth: {
                    username: process.env.RAZORPAY_KEY_ID,
                    password: process.env.RAZORPAY_SECRET_KEY,
                },
            }
        );

        const payments = paymentDetails.data.items;

        if (!payments || payments.length === 0) {
            return res.json({
                success: false,
                status: "No Payment Found",
                message: "No payment detected for this order",
            });
        }

        // ✅ Get the latest payment
        const payment = payments[payments.length - 1];
        const paymentStatus = payment.status;
        const paymentId = payment.id;
        const paymentAmount = payment.amount; // Already in paise

        console.log(`🔍 Payment Status: ${paymentStatus}, Payment ID: ${paymentId}`);

        if (paymentStatus === "captured") {
            return res.json({
                success: true,
                status: "Success",
                message: "Payment Captured Successfully!",
                payment_id: paymentId,
            });
        } else if (paymentStatus === "authorized") {
            // ✅ Capture Payment Manually
            await axios.post(
                `https://api.razorpay.com/v1/payments/${paymentId}/capture`,
                { amount: paymentAmount, currency: "INR" },
                {
                    auth: {
                        username: process.env.RAZORPAY_KEY_ID,
                        password: process.env.RAZORPAY_SECRET_KEY,
                    },
                }
            );

            console.log(`✅ Payment Captured: ${paymentId}`);

            return res.json({
                success: true,
                status: "captured",
                message: "Payment Captured Successfully!",
                payment_id: paymentId,
            });
        } else {
            return res.json({
                success: false,
                status: paymentStatus,
                message: "Payment Pending or Failed!",
            });
        }
    } catch (error) {
        console.error("❌ Error verifying payment:", error.response?.data || error);
        res.status(500).json({ error: "Payment verification error" });
    }
});

// ✅ Webhook for Automatic Payment Capture
app.post("/webhook", async (req, res) => {
    try {
        const payload = req.body;
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        // ✅ Generate Expected Signature
        const generatedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(JSON.stringify(payload))
            .digest("hex");

        if (signature !== generatedSignature) {
            console.warn("❌ Invalid Webhook Signature");
            return res.status(400).json({ error: "Invalid signature" });
        }

        if (payload.event === "payment.captured") {
            console.log(`✅ Payment Captured via Webhook: ${payload.payload.payment.entity.id}`);
            return res.json({ status: "success" });
        }

        res.status(400).json({ error: "Unhandled webhook event" });
    } catch (error) {
        console.error("❌ Webhook error:", error);
        res.status(500).json({ error: "Webhook processing failed" });
    }
});

// ✅ Start Server
app.listen(5000, () => console.log("🚀 Server running on port 5000"));
