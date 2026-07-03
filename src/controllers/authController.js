const authService = require('../services/authService');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    const { name, email, password, designation, company, phone, department, location, timezone, status } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const data = await authService.registerUser({
      name,
      email,
      password,
      designation,
      company,
      phone,
      department,
      location,
      timezone,
      status
    });
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const data = await authService.loginUser(email, password);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Get currently logged in user info
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      designation: req.user.designation || '',
      company: req.user.company || '',
      phone: req.user.phone || '',
      department: req.user.department || '',
      location: req.user.location || '',
      timezone: req.user.timezone || '',
      status: req.user.status || 'Active',
      twoFactorEnabled: req.user.twoFactorEnabled || false,
      createdAt: req.user.createdAt,
    };
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const checkSSO = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'Email query parameter is required' });
    }
    const data = await authService.checkSSO(email);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const ssoLogin = async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const data = await authService.ssoLogin(email, name);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verifyMFA = async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ message: 'tempToken and code are required' });
    }
    const data = await authService.verifyMFA(tempToken, code);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Please provide an email address' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const User = require('../models/User');
    const user = await User.findOne({ email: cleanEmail });

    // Secure response: do not confirm user existence unless needed, but handle SSO check user-friendlily
    if (!user) {
      return res.status(200).json({
        message: 'If your email is registered, you will receive a 6-digit OTP code to reset your password shortly.'
      });
    }

    // Check if account enforces SSO
    const { ssoRequired } = await authService.checkSSO(cleanEmail);
    if (ssoRequired) {
      return res.status(400).json({
        message: 'This account uses Single Sign-On (SSO). Please authenticate using Google SSO or your enterprise portal.'
      });
    }

    // Generate a secure 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const OTP = require('../models/OTP');
    // Save OTP to DB
    await OTP.create({
      email: cleanEmail,
      code,
      expiresAt
    });

    // Send email via email service
    const { sendOTPEmail } = require('../services/emailService');
    await sendOTPEmail(cleanEmail, code);

    res.status(200).json({
      message: 'If your email is registered, you will receive a 6-digit OTP code to reset your password shortly.'
    });
  } catch (error) {
    console.error('Forgot Password error:', error.message);
    res.status(500).json({ message: 'An error occurred while generating the reset code.' });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Please provide email and verification code' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const OTP = require('../models/OTP');

    // Find the latest unused, unexpired OTP for this email
    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      code: code.trim(),
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    // Mark the OTP as used immediately (single-use)
    otpRecord.used = true;
    await otpRecord.save();

    // Generate a secure reset token signed with JWT secret, valid for 10 minutes
    const jwt = require('jsonwebtoken');
    const resetToken = jwt.sign(
      { email: cleanEmail, otpId: otpRecord._id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.status(200).json({
      success: true,
      resetToken,
      message: 'Verification successful'
    });
  } catch (error) {
    console.error('Verify OTP error:', error.message);
    res.status(500).json({ message: 'An error occurred during verification.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, resetToken, password } = req.body;
    if (!email || !resetToken || !password) {
      return res.status(400).json({ message: 'Please provide all required parameters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Verify JWT resetToken
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ message: 'Invalid or expired password reset token' });
    }

    if (!decoded || decoded.purpose !== 'password-reset' || decoded.email !== cleanEmail) {
      return res.status(400).json({ message: 'Invalid reset token authorization' });
    }

    const User = require('../models/User');
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ message: 'User account not found' });
    }

    // Set new password (the model pre-save hook will hash it automatically)
    user.password = password;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully.'
    });
  } catch (error) {
    console.error('Reset Password error:', error.message);
    res.status(500).json({ message: 'An error occurred while resetting the password.' });
  }
};

module.exports = {
  register,
  login,
  getMe,
  checkSSO,
  ssoLogin,
  verifyMFA,
  forgotPassword,
  verifyOTP,
  resetPassword,
};
