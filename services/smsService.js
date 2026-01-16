// services/smsService.js

// Abstract Provider
class SMSProvider {
    async sendSMS(to, message) {
        throw new Error('Method not implemented');
    }
}

// Console Provider (For Dev / Default)
class ConsoleProvider extends SMSProvider {
    async sendSMS(to, message) {
        console.log('\n--- SMS OUTGOING ---');
        console.log(`TO: ${to}`);
        console.log(`MSG: ${message}`);
        console.log('--------------------\n');
        return { success: true, id: 'console-' + Date.now() };
    }
}

// SLT Mobitel Provider (Placeholder for future)
// Credentials can be loaded from env
class SltMobitelProvider extends SMSProvider {
    constructor(apiUrl, username, password) {
        super();
        this.apiUrl = apiUrl;
        this.username = username;
        this.password = password;
    }

    async sendSMS(to, message) {
        // TODO: Implement actual HTTP request to SLT Mobitel API
        console.log(`[SLT Mobitel] Sending to ${to}: ${message}`);
        // Mock response for now until credentials arrive
        return { success: true, id: 'slt-mock-' + Date.now() };
    }
}

class SmsService {
    constructor() {
        // Configurable provider - default to Console for now
        // In future, check process.env.SMS_PROVIDER === 'SLT' to switch
        this.provider = new ConsoleProvider();
    }

    async sendOTP(mobile, otp) {
        const message = `Your Nature Farming OTP is: ${otp}. Valid for 2 minutes.`;
        return this.provider.sendSMS(mobile, message);
    }

    async sendBillSMS(mobile, billData) {
        // billData: { name, type, id, date, amount }
        const { name, type, billNumber, date, amount } = billData;
        const message = `Dear ${name}, your ${type} (Ref: ${billNumber}) on ${date} for Rs. ${amount} is complete. Thank you! - Nature Farming`;
        return this.provider.sendSMS(mobile, message);
    }
}

// Singleton instance
module.exports = new SmsService();
