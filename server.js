require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image"); // QR Code generator
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Check if API Keys are Set
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
        const { amount } = req.body;

        // Validate Amount
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount specified. Amount must be a positive number." });
        }

        console.log("🔹 Creating UPI payment for amount:", amount);

        // ✅ Create Razorpay Order (No need to specify UPI manually)
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            payment_capture: 1, // Auto-capture payment after success
        });

        console.log("✅ Razorpay Order Created:", order);

        // ✅ Generate UPI Payment Link using Valid Business UPI ID
        const upiPaymentLink = `upi://pay?pa=${process.env.UPI_RECIPIENT_ID}&pn=${encodeURIComponent(
            "VEND MASTER"
        )}&tn=${encodeURIComponent("Vending Machine Payment")}&am=${amount}&cu=INR`;

        console.log("✅ UPI Payment Link:", upiPaymentLink);

        // ✅ Generate QR Code for UPI Payment
        const qrCodeImage = qr.image(upiPaymentLink, { type: "png" });
        const qrCodePath = path.join(qrCodeDir, `payment_qr_${Date.now()}.png`);

        const qrStream = fs.createWriteStream(qrCodePath);
        qrCodeImage.pipe(qrStream);

        qrStream.on("finish", () => {
            res.json({
                success: true,
                upiPaymentUrl: upiPaymentLink,
                qrCodeUrl: `https://vend-master.onrender.com/qrcodes/${path.basename(qrCodePath)}`, // Update with your server URL
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

// ✅ Webhook Endpoint for Payment Verification
app.post("/webhook", async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET; // Set this in your .env file

    let webhookBody = req.body;
    let webhookSignature = req.headers["x-razorpay-signature"];

    // Step 1: Verify the Webhook Signature
    const generatedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(webhookBody))
        .digest("hex");

    if (generatedSignature !== webhookSignature) {
        return res.status(400).json({ error: "Invalid signature" });
    }

    // Step 2: Process Payment Capture Event
    if (webhookBody.event === "payment.captured") {
        const paymentId = webhookBody.payload.payment.entity.id;
        const orderId = webhookBody.payload.payment.entity.order_id;

        try {
            // Fetch Payment Details using Razorpay API
            const paymentDetails = await razorpay.payments.fetch(paymentId);

            if (paymentDetails.status === "captured") {
                // Payment captured successfully
                console.log("✅ Payment Captured:", paymentDetails);
                // Update your database or handle the successful payment here
                res.status(200).json({ success: true, message: "Payment captured successfully" });
            } else {
                res.status(400).json({ error: "Payment not captured. Please try again." });
            }
        } catch (error) {
            console.error("❌ Error fetching payment details:", error.message);
            res.status(500).json({ error: "Internal Server Error" });
        }
    } else {
        // Handle other events if necessary
        res.status(200).json({ success: true, message: "Event received" });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
