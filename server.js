require('dotenv').config();  // To load environment variables from a .env file
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// Payment route to create a new order and QR code
app.post('/create-payment-link', async (req, res) => {
  try {
    const { amount } = req.body;  // Amount to be paid in INR

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount." });
    }

    const currency = 'INR';  // Currency

    // Create a new order on Razorpay
    const order = await razorpay.orders.create({
      amount: amount * 100,  // Razorpay accepts amount in paise
      currency,
      receipt: `order_${Date.now()}`,
      notes: {
        description: 'Vending Machine Payment',
      },
    });

    const orderId = order.id;

    // Create the UPI payment link
    const paymentLink = `upi://pay?pa=vprabhasivashankarsk-1@oksbi&pn=VEND%20MASTER&tn=Vending%20Machine%20Payment&am=${amount}&cu=${currency}`;
    
    // Generate QR code for the payment link
    const qrCodeUrl = await QRCode.toDataURL(paymentLink);

    // Send the response with order details and QR code URL
    res.json({
      success: true,
      message: 'Payment link created successfully.',
      orderId,
      paymentLink,
      qrCodeUrl,
    });
  } catch (error) {
    console.error('Error creating payment link:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Payment verification route
app.post('/verify-payment', async (req, res) => {
  try {
    const { paymentId, orderId, signature } = req.body;

    // Validate required fields
    if (!paymentId || !orderId || !signature) {
      return res.status(400).json({ error: 'Missing required payment details.' });
    }

    // Generate the Razorpay signature using crypto
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const payload = `${orderId}|${paymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // Verify the signature
    if (generatedSignature !== signature) {
      return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
    }

    // Fetch payment details to verify its status
    const paymentDetails = await razorpay.payments.fetch(paymentId);

    // Verify the payment status
    if (paymentDetails.status === 'captured') {
      res.json({ success: true, message: 'Payment verified successfully.' });
    } else {
      res.status(400).json({ error: 'Payment not captured. Please try again.' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
