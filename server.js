require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image"); // For QR code generation
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// ✅ Create Order & Generate QR Code
app.post("/create-payment-link", async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: "Invalid amount specified" });
        }

        // ✅ Create Razorpay Payment Link
        const paymentLink = await razorpay.paymentLink.create({
            amount: amount * 100, // Amount in paise
            currency: "INR",
            description: "Vending Machine Payment",
            customer: {
                name: "Customer",
                email: "customer@example.com",
                contact: "9999999999",
            },
            notify: {
                sms: true,
                email: true,
            },
            callback_url: "qwerty://payment-success",
 // Redirect after payment
            callback_method: "get",
        });

        console.log("✅ Payment Link Created:", paymentLink.short_url);

        // ✅ Generate QR Code for the Payment Link
        const qrCodeImage = qr.image(paymentLink.short_url, { type: "png" });
        const qrCodePath = `./qrcodes/payment_qr_${Date.now()}.png`;
        qrCodeImage.pipe(fs.createWriteStream(qrCodePath));

        res.json({
            success: true,
            paymentLink: paymentLink.short_url,
            qrCodePath,
        });

    } catch (error) {
    console.error("❌ Error creating payment link:", error.response?.data || error.message || error);
    res.status(500).json({ error: error.response?.data || "Internal Server Error" });
}

});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
