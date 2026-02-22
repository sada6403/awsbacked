const RequestLog = require('../models/RequestLog');

const idempotency = async (req, res, next) => {
    const requestId = req.headers['request-id'] || req.body.requestId;

    if (!requestId) {
        return next();
    }

    try {
        const existingRequest = await RequestLog.findOne({ requestId });

        if (existingRequest) {
            console.log(`[Idempotency] Returning cached response for requestId: ${requestId}`);
            return res.status(200).json(existingRequest.response);
        }

        // Monkey-patch res.json to catch the response and save it
        const originalJson = res.json;
        res.json = function (data) {
            // Only cache successful or conflict responses
            if (res.statusCode >= 200 && res.statusCode < 300 || res.statusCode === 409) {
                RequestLog.create({
                    requestId,
                    response: data
                }).catch(err => console.error(`[Idempotency] Error saving request log: ${err}`));
            }
            return originalJson.call(this, data);
        };

        next();
    } catch (error) {
        console.error(`[Idempotency] Middleware Error: ${error}`);
        next();
    }
};

module.exports = idempotency;
