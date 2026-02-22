const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Service to handle language detection and translation to English.
 */
class TranslationService {
    constructor() {
        const apiKey = process.env.GOOGLE_GENAI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        } else {
            console.warn('GOOGLE_GENAI_API_KEY is not set. Translation Service will operate in pass-through mode.');
        }
    }

    /**
     * Translates a given text to English if it's in another language.
     * @param {string} text - The input text (Tamil, Sinhala, or English).
     * @returns {Promise<string>} - The translated English text.
     */
    async translateToEnglish(text) {
        if (!text || text.trim() === '') return text;
        if (!this.genAI) {
            console.log('[TranslationService] Pass-through mode (No API Key)');
            return text;
        }

        try {
            const prompt = `You are a professional translator for NF Farming. 
            Detect the language of the following text. 
            If it is in Tamil or Sinhala, translate it accurately to English. 
            If it is already in English, return it exactly as it is. 
            Return ONLY the translated/original English text, no explanations.

            Text: ${text}`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const translatedText = response.text().trim();

            console.log(`[TranslationService] Original: "${text}" -> Translated: "${translatedText}"`);
            return translatedText;
        } catch (error) {
            console.error('Translation Service Error:', error);
            // Fallback to original text if translation fails
            return text;
        }
    }
}

module.exports = new TranslationService();
