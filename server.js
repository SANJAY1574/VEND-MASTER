require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Ensure API Keys & UPI ID are Set
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY || !process.env.UPI_RECIPIENT_ID) {
    console.error("❌ ERROR: Missing Razorpay API Keys or UPI ID. Check your .env file.");
    process.exit(1);
}

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// ✅ Create Directory for QR Codes
const qrCodeDir = path.join(__dirname, "qrcodes");
if (!fs.existsSync(qrCodeDir)) {
    fs.mkdirSync(qrCodeDir);
}

// ✅ Create UPI Payment & Generate QR Code
app.post("/create-upi-payment", async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount specified. Amount must be a positive number." });
        }

        console.log("🔹 Creating UPI payment for amount:", amount);

        // ✅ Create Razorpay Order
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            payment_capture: 1,
        });

        console.log("✅ Razorpay Order Created:", order);

        // ✅ Generate UPI Payment Link
        const upiPaymentUrl = `upi://pay?pa=${process.env.UPI_RECIPIENT_ID}&pn=VendMaster&mc=&tid=${order.id}&tr=${order.id}&tn=Payment+for+Vending+Machine&am=${amount}&cu=INR`;

        console.log("✅ UPI Payment Link:", upiPaymentUrl);

        // ✅ Generate QR Code
        const qrCodeImage = qr.image(upiPaymentUrl, { type: "png" });
        const qrCodePath = path.join(qrCodeDir, `payment_qr_${Date.now()}.png`);
        const qrStream = fs.createWriteStream(qrCodePath);
        qrCodeImage.pipe(qrStream);

        qrStream.on("finish", () => {
            res.json({
                success: true,
                upiPaymentUrl,
                qrCodeUrl: `https://your-backend.com/qrcodes/${path.basename(qrCodePath)}`,
                order_id: order.id, // ✅ Send Order ID for verification
            });
        });

        qrStream.on("error", (err) => {
            console.error("❌ Error writing QR code file:", err);
            res.status(500).json({ error: "Failed to generate QR code." });
        });

    } catch (error) {
        console.error("❌ Error creating UPI payment:", error.response?.data || error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Verify Payment using Razorpay API
app.post("/verify-payment", async (req, res) => {
    try {
        const { payment_id } = req.body;
        
        if (!payment_id) {
            return res.status(400).json({ success: false, error: "Missing payment ID" });
        }

        // ✅ Fetch Payment Details from Razorpay
        const payment = await razorpay.payments.fetch(payment_id);

        console.log("🔍 Payment Details:", payment);

        if (payment.status === "captured") {
            res.json({ success: true, message: "✅ Payment Successful", payment });
        } else {
            res.json({ success: false, message: "❌ Payment Not Completed", payment });
        }

    } catch (error) {
        console.error("❌ Error verifying payment:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// ✅ Serve QR Code Images
app.use("/qrcodes", express.static(qrCodeDir));

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
