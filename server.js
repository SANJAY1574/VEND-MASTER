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

        // ✅ Send order details, UPI link & QR code
        res.json({
            success: true,
            order_id: order.id,
            upiPaymentLink,
            qrCodeURL,
        });
    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

// ✅ Verify Payment After Transaction
app.post("/verify-payment", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // ✅ Generate Expected Signature
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_SECRET_KEY)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ error: "Invalid signature, payment verification failed" });
        }

        // ✅ Fetch payment details from Razorpay
        const paymentDetails = await axios.get(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
            auth: {
                username: process.env.RAZORPAY_KEY_ID,
                password: process.env.RAZORPAY_SECRET_KEY,
            },
        });

        const paymentStatus = paymentDetails.data.status;

        if (paymentStatus === "captured") {
            return res.json({
                success: true,
                status: "Success",
                message: "Payment Successful!",
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
        console.error("Error verifying payment:", error);
        res.status(500).json({ error: "Payment verification error" });
    }
});

// ✅ Webhook for Automatic Payment Capture
app.post("/webhook", async (req, res) => {
    try {
        const payload = req.body;
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        // ✅ Generate Expected Signature
        const generatedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(JSON.stringify(payload))
            .digest("hex");

        const signature = req.headers["x-razorpay-signature"];

        if (signature !== generatedSignature) {
            return res.status(400).json({ error: "Invalid signature" });
        }

        if (payload.event === "payment.captured") {
            console.log(`✅ Payment captured: ${payload.payload.payment.entity.id}`);

            return res.json({ status: "success" });
        }

        res.status(400).json({ error: "Unhandled webhook event" });
    } catch (error) {
        console.error("Webhook error:", error);
        res.status(500).json({ error: "Webhook processing failed" });
    }
});

// ✅ Start Server
app.listen(5000, () => console.log("🚀 Server running on port 5000"));
