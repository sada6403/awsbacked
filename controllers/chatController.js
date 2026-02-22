const aiService = require('../services/aiService');
const translationService = require('../services/translationService');

/**
 * Controller to handle AI chat requests.
 */
exports.getChatResponse = async (req, res) => {
    try {
        let { query } = req.body;

        if (!query || query.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Query is required'
            });
        }

        // Translate to English before processing
        query = await translationService.translateToEnglish(query.trim());

        const response = await aiService.getAloeCareResponse(query);

        res.status(200).json({
            success: true,
            data: {
                response: response
            }
        });
    } catch (error) {
        console.error('Chat Controller Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while processing chat',
            error: error.message
        });
    }
};
