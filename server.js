require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image"); // QR Code generator
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors({ origin: "*" })); // Allow all origins for testing in a development environment
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Check if API Keys are Set
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY || !process.env.UPI_ID) {
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
        const upiPaymentLink = `upi://pay?pa=${process.env.UPI_ID}&pn=${encodeURIComponent("VEND MASTER")}&tn=${encodeURIComponent("Vending Machine Payment")}&am=${amount}&cu=INR`;

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
                qrCodeUrl: `https://vend-master.onrender.com/qrcodes/${path.basename(qrCodePath)}`, // Replace with your IP address
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

// ✅ Payment Verification Endpoint
app.post("/verify-payment", async (req, res) => {
    try {
        const { paymentId, orderId, signature } = req.body;

        // Validate required fields
        if (!paymentId || !orderId || !signature) {
            return res.status(400).json({ error: "Missing required payment details." });
        }

        const generatedSignature = razorpay.utils.generateSignature(orderId, paymentId);

        // Verify the payment signature
        if (generatedSignature !== signature) {
            return res.status(400).json({ error: "Invalid payment signature. Verification failed." });
        }

        // Payment is verified, proceed to check payment status
        const paymentDetails = await razorpay.payments.fetch(paymentId);

        if (paymentDetails.status === "captured") {
            res.json({ success: true, message: "Payment verified successfully." });
        } else {
            res.status(400).json({ error: "Payment not captured. Please try again." });
        }
    } catch (error) {
        console.error("❌ Error verifying payment:", error.response?.data || error.message || error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
