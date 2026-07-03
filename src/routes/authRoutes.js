const express = require('express');
const router = express.Router();
const { register, login, getMe, checkSSO, ssoLogin, verifyMFA, forgotPassword, verifyOTP, resetPassword, checkInvitation } = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const { rateLimiter } = require('../middlewares/rateLimiter');

// Rate limiters for forgot password flow
const forgotPasswordLimiter = rateLimiter('forgot_password', 5, 15 * 60 * 1000);
const verifyOTPLimiter = rateLimiter('verify_otp', 5, 15 * 60 * 1000);
const resetPasswordLimiter = rateLimiter('reset_password', 5, 15 * 60 * 1000);

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/check-sso', checkSSO);
router.post('/sso-login', ssoLogin);
router.post('/verify-mfa', verifyMFA);
router.get('/check-invitation', checkInvitation);

router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/verify-otp', verifyOTPLimiter, verifyOTP);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

module.exports = router;