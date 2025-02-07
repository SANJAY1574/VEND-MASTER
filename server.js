require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const helmet = require("helmet"); // Added security module

const app = express();
app.use(cors());
app.use(helmet()); // Secure HTTP headers
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Ensure environment variables are set
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY) {
    console.error("❌ Missing Razorpay API credentials. Set them in .env");
    process.exit(1);
}

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

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount" });
        }

        // ✅ Create Razorpay Order
        const options = {
            amount: amount * 100, // Razorpay requires amount in paise
            currency: "INR",
            receipt: `order_${Date.now()}`,
            payment_capture: 1, // Auto capture
        };
        const order = await razorpay.orders.create(options);

        // ✅ Generate UPI Payment Link
        const upiPaymentLink = `upi://pay?pa=vprabhasivashankarsk-1@oksbi&pn=${encodeURIComponent(
            "VEND MASTER"
        )}&tn=${encodeURIComponent("Vending Machine Payment")}&am=${amount}&cu=INR`;

        // ✅ Generate QR Code for UPI Payment
        const qrCodeURL = generateQRCode(upiPaymentLink);

        console.log(`✅ Order Created: ${order.id}, Amount: ₹${amount}`);

        // ✅ Send order details, UPI link & QR code
        res.status(201).json({
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

// ✅ Verify Payment After Transaction
app.post("/verify-payment", async (req, res) => {
    try {
        const { razorpay_order_id } = req.body;

        if (!razorpay_order_id) {
            return res.status(400).json({ error: "Order ID is required" });
        }

        // ✅ Fetch payment details from Razorpay
        const paymentDetails = await axios.get(`https://api.razorpay.com/v1/orders/${razorpay_order_id}/payments`, {
            auth: {
                username: process.env.RAZORPAY_KEY_ID,
                password: process.env.RAZORPAY_SECRET_KEY,
            },
        });

        // ✅ Extract Payment ID and Status
        const payments = paymentDetails.data.items;
        if (payments.length > 0) {
            const payment = payments[0]; // Get the first successful payment
            const paymentStatus = payment.status;
            const paymentId = payment.id;

            console.log(`🔍 Payment Status for ${razorpay_order_id}: ${paymentStatus}`);

            if (paymentStatus === "captured") {
                return res.json({
                    success: true,
                    status: "Success",
                    message: "Payment Successful!",
                    payment_id: paymentId,
                });
            } else {
                return res.json({
                    success: false,
                    status: paymentStatus,
                    message: "Payment Pending or Failed!",
                });
            }
        } else {
            return res.json({
                success: false,
                status: "No Payment Found",
                message: "No payment detected for this order",
            });
        }
    } catch (error) {
        console.error("❌ Error verifying payment:", error);
        res.status(500).json({ error: "Payment verification error" });
    }
});

// ✅ Check Payment Status
app.get("/payment-status", async (req, res) => {
    try {
        const { payment_id } = req.query;

        if (!payment_id) {
            return res.status(400).json({ error: "Missing payment_id" });
        }

        // ✅ Fetch payment details from Razorpay
        const response = await axios.get(`https://api.razorpay.com/v1/payments/${payment_id}`, {
            auth: {
                username: process.env.RAZORPAY_KEY_ID,
                password: process.env.RAZORPAY_SECRET_KEY,
            },
        });

        const status = response.data.status;
        console.log(`🔄 Payment Status Check: ${payment_id} - ${status}`);

        if (status === "captured") {
            return res.json({ success: true, status: "paid" });
        } else {
            return res.json({ success: false, status });
        }
    } catch (error) {
        console.error("❌ Error fetching payment status:", error);
        res.status(500).json({ error: "Failed to fetch payment status" });
    }
});

// ✅ Webhook for Automatic Payment Capture
app.post("/webhook", async (req, res) => {
    try {
        const payload = req.body;
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error("❌ Missing webhook secret");
            return res.status(500).json({ error: "Webhook configuration error" });
        }

        // ✅ Generate Expected Signature
        const generatedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(JSON.stringify(payload))
            .digest("hex");

        const signature = req.headers["x-razorpay-signature"];

        if (signature !== generatedSignature) {
            console.warn("⚠️ Invalid Webhook Signature");
            return res.status(400).json({ error: "Invalid signature" });
        }

        if (payload.event === "payment.captured") {
            console.log(`✅ Payment Captured: ${payload.payload.payment.entity.id}`);
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
