const https = require('https');
const http = require('http');

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

// SLT Mobitel Provider (HTTP)
class MobitelHttpProvider extends SMSProvider {
    constructor(apiUrl, username, password, senderId) {
        super();
        this.apiUrl = apiUrl || 'https://msmsenterpriseapi.mobitel.lk/EnterpriseSMSV3/esmsproxy.php';
        this.username = username;
        this.password = password;
        this.senderId = senderId || 'NF Groups';
    }

    async sendSMS(to, message) {
        console.log(`[Mobitel HTTP] Sending to ${to}...`);

        try {
            const url = new URL(this.apiUrl);
            url.searchParams.append('u', this.username);
            url.searchParams.append('p', this.password);
            url.searchParams.append('r', to);
            url.searchParams.append('m', message);
            url.searchParams.append('a', this.senderId);
            url.searchParams.append('t', '0'); // Non-Promotional

            return new Promise((resolve, reject) => {
                const client = url.protocol === 'https:' ? https : http;
                client.get(url, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        console.log(`[Mobitel HTTP] Response (${res.statusCode}): ${data}`);
                        if (res.statusCode === 200 && data.trim() === '200') {
                            resolve({ success: true, id: data });
                        } else {
                            resolve({ success: false, error: `Code: ${data}` });
                        }
                    });
                }).on('error', (err) => {
                    console.error('[Mobitel HTTP] Connection Error:', err);
                    resolve({ success: false, error: err.message });
                });
            });

        } catch (e) {
            console.error('[Mobitel HTTP] Error:', e);
            return { success: false, error: e.message };
        }
    }
}

class SmsService {
    constructor() {
        const { MOBITEL_USERNAME, MOBITEL_PASSWORD, MOBITEL_API_URL, MOBITEL_SENDER_ID } = process.env;

        // Check if username/password exist
        if (MOBITEL_USERNAME && MOBITEL_PASSWORD) {
            console.log('>>> SMS Service: Using Mobitel HTTP Provider');
            this.provider = new MobitelHttpProvider(
                MOBITEL_API_URL,
                MOBITEL_USERNAME,
                MOBITEL_PASSWORD,
                MOBITEL_SENDER_ID
            );
        } else {
            console.log('>>> SMS Service: Using Console Provider');
            this.provider = new ConsoleProvider();
        }
    }

    async sendOTP(mobile, otp) {
        // Sanitize: Ensure 94XXXXXXXXX format
        const cleanMobile = this._formatMobile(mobile);
        console.log(`[SMS] Sanitized ${mobile} -> ${cleanMobile}`);

        const message = `Your Nature Farming OTP is: ${otp}. Valid for 2 minutes.`;
        return this.provider.sendSMS(cleanMobile, message);
    }

    _formatMobile(mobile) {
        let clean = mobile.replace(/\D/g, ''); // Remove non-digits

        // Handle local 07X format
        if (clean.startsWith('0') && clean.length === 10) {
            clean = '94' + clean.substring(1);
        }
        // Handle 7X format (missing leading 0 or 94)
        else if (clean.length === 9 && clean.startsWith('7')) {
            clean = '94' + clean;
        }
        // Handle already 94 format (ensure it's not double prefixed? No, regex removed +)

        return clean;
    }

    async sendBillSMS(mobile, billData) {
        const cleanMobile = this._formatMobile(mobile);
        const { name, type, billNumber, date, amount, productName, quantity, unitType, unitPrice } = billData;

        // Defensive null checks to prevent crashes
        const safeName = name || 'Customer';
        const safeProductName = productName || 'Product';
        const safeQuantity = quantity || 0;
        const safeUnitType = unitType || 'units';
        const safeUnitPrice = unitPrice || 0;
        const safeAmount = amount || 0;
        const safeBillNumber = billNumber || 'N/A';
        const safeDate = date || new Date().toLocaleDateString();

        // Clean & Spaced Format with proper newlines
        const message = `Nature Farming Update

Dear ${safeName},
${type === 'BUY' ? 'Purchase' : 'Sale'} Successful!

Item: ${safeProductName}
Qty: ${safeQuantity} ${safeUnitType}
Price: Rs. ${safeUnitPrice}/${safeUnitType}
Total: Rs. ${safeAmount}

Ref: ${safeBillNumber}
Date: ${safeDate}

Thank you!`;

        return this.provider.sendSMS(cleanMobile, message);
    }

    async sendRegistrationSuccessSMS(mobile, name, amount) {
        const cleanMobile = mobile.replace(/^\+/, '');
        const message = `Welcome to Nature Farming! Dear ${name}, we have received your registration fee of Rs. ${amount}. Your membership is now active. Thank you!`;
        return this.provider.sendSMS(cleanMobile, message);
    }

    async sendGeneralSMS(mobile, message) {
        const cleanMobile = mobile.replace(/^\+/, '');
        return this.provider.sendSMS(cleanMobile, message);
    }
}

module.exports = new SmsService();
