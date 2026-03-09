const express = require('express');
const chatController = require('../controllers/chatController');
const authController = require('../controllers/authController');
const uploadController = require('../controllers/uploadController');
const { ensureAuthenticated, ensureGuest } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/signup', ensureGuest, authController.renderSignup);
router.post('/signup', ensureGuest, authController.signup);

router.get('/login', ensureGuest, authController.renderLogin);
router.post('/login', ensureGuest, authController.login);

router.post('/logout', ensureAuthenticated, authController.logout);

router.post('/api/upload', ensureAuthenticated, upload.single('file'), uploadController.uploadFile);

router.get('/', ensureAuthenticated, chatController.renderChatPage);

module.exports = router;
