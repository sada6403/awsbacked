const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Service to handle AI interactions for Aloe Vera cultivation advice.
 */
class AIService {
    constructor() {
        const apiKey = process.env.GOOGLE_GENAI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        } else {
            console.warn('GOOGLE_GENAI_API_KEY is not set. AI Service will operate in fallback mode.');
        }
    }

    /**
     * Get a response from the AI model for a given query.
     * @param {string} query - The user's question about Aloe Vera.
     * @returns {Promise<string>} - The AI generated response.
     */
    async getAloeCareResponse(query) {
        if (!this.genAI) {
            return "I'm currently in offline mode. For Aloe Vera care, remember: bright indirect light and water only when soil is dry (every 2-3 weeks).";
        }

        try {
            const systemPrompt = "You are an expert Aloe Vera cultivation assistant for NF Farming. " +
                "Provide helpful, accurate, and concise advice on planting, watering, pests, and harvesting Aloe Vera. " +
                "Respond in a friendly tone. If the query is unrelated to Aloe Vera or farming, politely redirect the user.";

            const prompt = `${systemPrompt}\n\nUser Question: ${query}`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('AI Service Error:', error);
            return "I'm having trouble connecting to my knowledge base right now. Generally, Aloe Vera needs well-draining soil and minimal watering.";
        }
    }
}

module.exports = new AIService();
