const express = require('express');
const router = express.Router();
const { getAppConfigs, upsertAppConfig, updateAppStatus, getAppStatusByAppId } = require('../controllers/appConfigController');
const { protect } = require('../middleware/authMiddleware');

router.get('/check/:appId', getAppStatusByAppId);

router.route('/')
    .get(protect, getAppConfigs)
    .post(protect, upsertAppConfig);

router.patch('/:id/status', protect, updateAppStatus);

module.exports = router;
