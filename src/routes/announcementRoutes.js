const express = require('express');
const router = express.Router();
const { createAnnouncement } = require('../controllers/announcementController');
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember } = require('../middlewares/rbac');

router.post('/', protect, requireWorkspaceMember, createAnnouncement);

module.exports = router;
