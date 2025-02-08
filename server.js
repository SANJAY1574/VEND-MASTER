require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Route: Create Razorpay Order
app.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    console.log(`💰 Creating order for ₹${amount}`);

    // Convert amount to paise (Razorpay accepts amount in smallest currency unit)
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert ₹ to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
    });

    console.log(`✅ Order created: ${order.id}`);

    // Return the order details to the frontend
    res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("❌ Error creating order:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ Route: Verify Payment
app.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing payment details" });
    }

    console.log("🔄 Verifying Payment...");

    // Signature verification
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      console.error("❌ Payment verification failed");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    console.log(`✅ Payment verified: ${razorpay_payment_id}`);

    res.status(200).json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }

});


// ✅ Route: Create QR Code for Payment
app.post('/create-qr', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    console.log(`📸 Creating QR Code for ₹${amount}`);

    // Convert amount to paise
    const qrCode = await razorpay.qrCode.create({
      type: "upi_qr",
      name: "My Store",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: amount * 100, // Convert ₹ to paise
      description: "Payment for your order",
      customer_id: `customer_${Date.now()}`
    });

    console.log(`✅ QR Code created: ${qrCode.id}`);

    // Send QR code details to the frontend
    res.status(200).json({
      success: true,
      qr_code_id: qrCode.id,
      qr_code_url: qrCode.image_url,
      amount: amount,
    });

  } catch (error) {
    console.error("❌ Error creating QR code:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
