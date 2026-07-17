const express = require('express');
const router = express.Router();
const {
  getPresignedUploadUrl,
  uploadLocalFile,
  createAttachment,
  deleteAttachment,
  updateAttachment,
} = require('../controllers/attachmentController');
const { protect } = require('../middlewares/auth');

// Public route for local mock binary upload fallback (same shape as Cloudflare S3 PUT)
router.put('/upload-local', uploadLocalFile);

// Secure routes
router.post('/presigned-url', protect, getPresignedUploadUrl);
router.post('/', protect, createAttachment);
router.put('/:id', protect, updateAttachment);
router.delete('/:id', protect, deleteAttachment);

module.exports = router;
