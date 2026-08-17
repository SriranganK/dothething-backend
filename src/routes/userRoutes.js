const express = require('express');
const router = express.Router();

const {
  updateProfile,
  changePassword,
  getUserProfile,
  searchUsers,
} = require('../controllers/userController');

const { protect } = require('../middlewares/auth');

router.get('/search', protect, searchUsers);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);
router.get('/:userId/profile', protect, getUserProfile);

module.exports = router;