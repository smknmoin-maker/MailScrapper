const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');

// Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOTPEmail(email, otp, name) {
  const mailOptions = {
    from: `"MailScrapper" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '🔐 Your MailScrapper Verification Code',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 40px; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); border-radius: 16px; color: #ffffff;">
        <h1 style="text-align: center; font-size: 28px; margin-bottom: 10px;">🔐 MailScrapper</h1>
        <p style="text-align: center; color: #b0b0b0; font-size: 14px;">Email Verification Code</p>
        <hr style="border: 1px solid #444; margin: 20px 0;" />
        <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #d0d0d0;">Use the following code to verify your identity:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); padding: 16px 40px; border-radius: 12px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #fff;">${otp}</span>
        </div>
        <p style="font-size: 13px; color: #999; text-align: center;">This code expires in <strong>5 minutes</strong>.</p>
        <p style="font-size: 13px; color: #999; text-align: center;">If you didn't request this, please ignore this email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// Step 1: Redirect to Google OAuth
router.get('/google', (req, res) => {
  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://mail.google.com/'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    include_granted_scopes: true
  });

  console.log('🔗 Redirecting to Google OAuth with scopes:', scopes);
  res.redirect(authUrl);
});

// Step 2: Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('📋 Tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      scope: tokens.scope,
      expiryDate: tokens.expiry_date
    });
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Save or update user
    let user = await User.findOne({ googleId: userInfo.id });

    if (user) {
      user.accessToken = tokens.access_token;
      if (tokens.refresh_token) {
        user.refreshToken = tokens.refresh_token;
      }
      user.isVerified = false; // Require OTP every login
      await user.save();
    } else {
      user = await User.create({
        googleId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        isVerified: false
      });
    }

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await user.save();

    // Send OTP email
    await sendOTPEmail(user.email, otp, user.name);

    // Create a temporary token (not fully authenticated yet)
    const tempToken = jwt.sign(
      { userId: user._id, temp: true },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    // Redirect to frontend OTP page
    res.redirect(`${process.env.FRONTEND_URL}/verify-otp?token=${tempToken}&email=${encodeURIComponent(user.email)}`);

  } catch (error) {
    console.error('Google callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
  }
});

// Step 3: Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { otp, token } = req.body;

    if (!otp || !token) {
      return res.status(400).json({ message: 'OTP and token are required.' });
    }

    // Decode temp token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP has expired. Please log in again.' });
    }

    // Mark as verified
    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // Issue full JWT
    const fullToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'OTP verified successfully!',
      token: fullToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Verification failed.' });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { token } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    await sendOTPEmail(user.email, otp, user.name);

    res.json({ message: 'OTP resent successfully!' });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Failed to resend OTP.' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-otp -otpExpiry -accessToken -refreshToken');

    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.json({ user });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token.' });
  }
});

module.exports = router;
