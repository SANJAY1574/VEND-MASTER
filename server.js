require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// ✅ Predefined Amount (in INR)
const PREDEFINED_AMOUNT = 1; // Amount in INR

// ✅ Create Order & Generate QR Code
app.post("/create-order", async (req, res) => {
    try {
        // ✅ Step 1: Create a Razorpay Order with UPI ID
        const order = await razorpay.orders.create({
            amount: PREDEFINED_AMOUNT * 100, // Amount in paise
            currency: "INR",
            receipt: "order_" + Date.now(),
            payment_capture: 1, // Auto capture
            method: "upi",
            upi: {
                vpa: "vprabhasivashankarsk-1@oksbi" // ✅ Replace with your actual UPI ID
            }
        });

        console.log(`✅ Order Created: ${order.id}`);

        // ✅ Step 2: Generate QR Code from Razorpay API
        const qrCode = await razorpay.qrCodes.create({
            type: "upi_qr",
            name: "Vend Master Payment",
            usage: "single_use",
            fixed_amount: true,
            payment_amount: PREDEFINED_AMOUNT * 100, // Amount in paise
            description: "Payment for vending machine",
            order_id: order.id, // ✅ Link the QR code to the order
        });

        console.log(`✅ QR Code Generated: ${qrCode.id}`);

        // ✅ Send Response with Order & QR Code
        res.json({
            success: true,
            order_id: order.id,
            qrCodeURL: qrCode.image_url, // Razorpay QR Code URL
        });
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Failed to generate payment link & QR code" });
    }
});

// ✅ Verify Payment
app.post("/verify-payment", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: "Missing payment details" });
        }

        // ✅ Verify Payment Signature
        const generatedSignature = require("crypto")
            .createHmac("sha256", process.env.RAZORPAY_SECRET_KEY)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ error: "Invalid payment signature" });
        }

        console.log(`✅ Payment Verified: ${razorpay_payment_id}`);

        res.json({
            success: true,
            message: "Payment Verified Successfully!",
            payment_id: razorpay_payment_id,
        });
    } catch (error) {
        console.error("❌ Payment Verification Error:", error);
        res.status(500).json({ error: "Failed to verify payment" });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
