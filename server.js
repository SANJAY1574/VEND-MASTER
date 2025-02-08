const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const QRCode = require("qrcode"); // QR Code generation

require("dotenv").config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,  // Use environment variables for security
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// 🛒 **Create an Order & Generate UPI QR Code**
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount is required" });

    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paisa
      currency: "INR",
      payment_capture: 1
    });

    // Generate QR Code for UPI payment
    const upiPaymentLink = `upi://pay?pa=vprabhasivashankarsk-1@oksbi&pn=VendMaster&mc=1234&tid=${order.id}&tr=order_${order.id}&tn=Payment&am=${amount}&cu=INR`;
    const qrCodeURL = await QRCode.toDataURL(upiPaymentLink);

    res.json({
      success: true,
      order_id: order.id,
      upiPaymentLink,
      qrCodeURL
    });

  } catch (error) {
    console.error("🔥 Error Creating Order:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ **Verify Payment**
app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      res.json({ success: true, message: "Payment Verified!" });
    } else {
      res.json({ success: false, message: "Payment Verification Failed!" });
    }

  } catch (error) {
    console.error("🔥 Error Verifying Payment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 🚀 **Start Server**
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});
