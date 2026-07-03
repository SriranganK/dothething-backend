const express = require('express');
const router = express.Router();

const {
  updateProfile,
  changePassword,
  getUserProfile,
} = require('../controllers/userController');

const { protect } = require('../middlewares/auth');

router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);
router.get('/:userId/profile', protect, getUserProfile);

module.exports = router;