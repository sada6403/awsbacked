const https = require('https');

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

// SLT Mobitel Provider
class SltMobitelProvider extends SMSProvider {
    constructor(apiUrl, username, password, senderId) {
        super();
        this.apiUrl = apiUrl || 'https://richcommunication.mobitel.lk/api/sms/send'; // Default or Env
        this.username = username;
        this.password = password;
        this.senderId = senderId || 'NF Farming';
    }

    async sendSMS(to, message) {
        console.log(`[SLT Mobitel] Sending to ${to}...`);

        // Construct payload
        // Note: This payload structure depends on the specific Mobitel API version.
        // Common structure for JSON APIs:
        const payload = JSON.stringify({
            "campaignName": this.senderId,
            "mask": this.senderId,
            "numbers": [to],
            "content": message
        });

        // If the user has a query-param based API, we might need to adjust.
        // For now, assume a standard POST JSON API or provide instructions to adjust.
        // Let's implement a generic JSON POST for now, which is common.

        // HOWEVER, many older gateways use GET.
        // Let's assume the user will provide the API_URL which usually dictates the method.
        // Use a safe wrapper.

        return new Promise((resolve, reject) => {
            // Parse URL to determine hostname/path
            try {
                const urlObj = new URL(this.apiUrl);

                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        console.log(`[SLT Mobitel] Response: ${res.statusCode} - ${data}`);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true, data: data });
                        } else {
                            // Fallback to console if failed? OR just log error.
                            console.error('[SLT Mobitel] Failed:', data);
                            resolve({ success: false, error: data });
                        }
                    });
                });

                req.on('error', (e) => {
                    console.error('[SLT Mobitel] Network Error:', e);
                    resolve({ success: false, error: e.message });
                });

                req.write(payload);
                req.end();
            } catch (e) {
                console.error('[SLT Mobitel] Config Error:', e);
                resolve({ success: false, error: e.message });
            }
        });
    }
}

class SmsService {
    constructor() {
        const { MOBITEL_USERNAME, MOBITEL_PASSWORD, MOBITEL_API_URL, MOBITEL_SENDER_ID } = process.env;

        if (MOBITEL_USERNAME && MOBITEL_PASSWORD) {
            console.log('>>> SMS Service: Using SLT Mobitel Provider');
            this.provider = new SltMobitelProvider(
                MOBITEL_API_URL,
                MOBITEL_USERNAME,
                MOBITEL_PASSWORD,
                MOBITEL_SENDER_ID
            );
        } else {
            console.log('>>> SMS Service: Using Console Provider (Credentials not found)');
            this.provider = new ConsoleProvider();
        }
    }

    async sendOTP(mobile, otp) {
        const message = `Your Nature Farming OTP is: ${otp}. Valid for 2 minutes.`;
        return this.provider.sendSMS(mobile, message);
    }

    async sendBillSMS(mobile, billData) {
        const { name, type, billNumber, date, amount } = billData;
        const message = `Dear ${name}, your ${type} (Ref: ${billNumber}) on ${date} for Rs. ${amount} is complete. Thank you! - Nature Farming`;
        return this.provider.sendSMS(mobile, message);
    }
}

module.exports = new SmsService();
