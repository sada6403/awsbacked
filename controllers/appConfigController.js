const AppConfig = require('../models/AppConfig');

// @desc    Get all app configs
// @route   GET /api/app-config
// @access  Private/Admin
exports.getAppConfigs = async (req, res) => {
    try {
        const configs = await AppConfig.find().sort({ appName: 1 });
        res.json(configs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create or update app config
// @route   POST /api/app-config
// @access  Private/Admin
exports.upsertAppConfig = async (req, res) => {
    const { appId, appName, status, minVersion, environment, message } = req.body;
    try {
        let config = await AppConfig.findOne({ appId });
        if (config) {
            config.appName = appName || config.appName;
            config.status = status || config.status;
            config.minVersion = minVersion || config.minVersion;
            config.environment = environment || config.environment;
            config.message = message || config.message;
            config.updatedAt = Date.now();
            await config.save();
        } else {
            config = await AppConfig.create({
                appId,
                appName,
                status,
                minVersion,
                environment,
                message
            });
        }
        res.status(201).json(config);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update app status ONLY (maintenance toggle)
// @route   PATCH /api/app-config/:id/status
// @access  Private/Admin
exports.updateAppStatus = async (req, res) => {
    const { status } = req.body;
    try {
        const config = await AppConfig.findById(req.params.id);
        if (!config) return res.status(404).json({ message: 'App config not found' });

        config.status = status;
        config.updatedAt = Date.now();
        await config.save();
        res.json(config);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get app status by appId (Public)
// @route   GET /api/app-config/check/:appId
// @access  Public
exports.getAppStatusByAppId = async (req, res) => {
    try {
        const config = await AppConfig.findOne({ appId: req.params.appId });
        if (!config) return res.status(404).json({ message: 'App not found' });
        res.json({
            status: config.status,
            minVersion: config.minVersion,
            message: config.message,
            environment: config.environment
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
