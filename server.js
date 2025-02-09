require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image"); // For QR code generation
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Check if API Keys are Set
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY) {
    console.error("❌ ERROR: Razorpay API Keys are missing. Check your .env file.");
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

        // ✅ Create Razorpay Order for UPI Payment
        const order = await razorpay.orders.create({
            amount: Math.round(amount * 100), // Convert to paise
            currency: "INR",
            payment_capture: 1,
            method: "upi",
            upi: {
                vpa: "vprabhasivashankarsk-1@oksbi", // ✅ Replace with your UPI ID
            }
        });

        console.log("✅ UPI Order Created:", order);

        // ✅ Generate UPI Payment Link
        const upiPaymentUrl = `upi://pay?pa=vprabhasivashankarsk-1@oksbi&pn=VendMaster&mc=&tid=${order.id}&tr=${order.id}&tn=Payment+for+Vending+Machine&am=${amount}&cu=INR`;

        console.log("✅ UPI Payment Link:", upiPaymentUrl);

        // ✅ Generate QR Code for UPI Payment
        const qrCodeImage = qr.image(upiPaymentUrl, { type: "png" });
        const qrCodePath = path.join(qrCodeDir, `payment_qr_${Date.now()}.png`);
        
        const qrStream = fs.createWriteStream(qrCodePath);
        qrCodeImage.pipe(qrStream);

        qrStream.on("finish", () => {
            res.json({
                success: true,
                upiPaymentUrl,
                qrCodeUrl: `https://vend-master.onrender.com/qrcodes/${path.basename(qrCodePath)}`,
            });
        });

        qrStream.on("error", (err) => {
            console.error("❌ Error writing QR code file:", err);
            res.status(500).json({ error: "Failed to generate QR code." });
        });

    } catch (error) {
        console.error("❌ Error creating UPI payment:", error.response?.data || error.message || error);
        res.status(500).json({ error: error.response?.data || "Internal Server Error" });
    }
});

// ✅ Serve QR Code Images
app.use("/qrcodes", express.static(qrCodeDir));

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
