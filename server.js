require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const qr = require("qr-image"); // QR Code generator
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ✅ Check if API Keys and UPI ID are Set
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
app.post("/verify-payment", async (req, res) => {
    try {
        const { payment_id } = req.body;
        
        if (!payment_id) {
            return res.status(400).json({ success: false, error: "Missing payment ID" });
        }

        // ✅ Call Razorpay API to Fetch Payment Details
        const payment = await razorpay.payments.fetch(payment_id);

        console.log("🔍 Payment Details:", payment);

        if (payment.status === "captured") {
            res.json({ success: true, message: "Payment Successful", payment });
        } else {
            res.json({ success: false, message: "Payment Not Completed", payment });
        }

    } catch (error) {
        console.error("❌ Error verifying payment:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});


        console.log("✅ Razorpay Order Created:", order);

        // ✅ Generate UPI Payment Link using a Valid Business UPI ID
        const upiPaymentUrl = `upi://pay?pa=${process.env.UPI_RECIPIENT_ID}&pn=VendMaster&tn=Payment for Vending Machine&am=${amount}&cu=INR`;

        console.log("✅ UPI Payment Link:", upiPaymentUrl);

        // ✅ Generate QR Code for UPI Payment
        const qrCodeImage = qr.image(upiPaymentUrl, { type: "png" });
        const qrCodePath = path.join(qrCodeDir, `payment_qr_${Date.now()}.png`);
        
        const qrStream = fs.createWriteStream(qrCodePath);
        qrCodeImage.pipe(qrStream);

        qrStream.on("finish", () => {
            res.json({
                success: true,
                orderId: order.id,
                upiPaymentUrl,
                qrCodeUrl: `${req.protocol}://${req.get("host")}/qrcodes/${path.basename(qrCodePath)}`,

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
// ✅ Serve QR Code Images (Make Static Files Publicly Accessible)
app.use("/qrcodes", express.static(qrCodeDir, { 
    setHeaders: (res, path) => {
        res.set("Access-Control-Allow-Origin", "*");  // Allow access from anywhere
        res.set("Content-Type", "image/png"); // Ensure correct MIME type
    }
}));


// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
