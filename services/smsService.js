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

// SLT Mobitel Provider (SOAP)
class SltMobitelProvider extends SMSProvider {
    constructor(apiUrl, username, password, senderId) {
        super();
        this.apiUrl = apiUrl || 'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS.php';
        this.username = username;
        this.password = password;
        this.senderId = senderId || 'NF Farming';
    }

    _sendSoapRequest(action, bodyXml) {
        return new Promise((resolve, reject) => {
            const envelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.esms.mobitel.lk/">
   <soapenv:Header/>
   <soapenv:Body>
      ${bodyXml}
   </soapenv:Body>
</soapenv:Envelope>`.trim();

            const urlObj = new URL(this.apiUrl);
            const client = urlObj.protocol === 'https:' ? https : http;

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml;charset=UTF-8',
                    'Content-Length': Buffer.byteLength(envelope),
                    'SOAPAction': ''
                }
            };

            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode, body: data });
                });
            });

            req.on('error', (e) => reject(e));
            req.write(envelope);
            req.end();
        });
    }

    _extractTag(xml, tagName) {
        const match = xml.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`));
        return match ? match[1] : null;
    }

    async sendSMS(to, message) {
        console.log(`[SLT Mobitel] Sending to ${to}...`);

        try {
            // 1. Create Session
            const loginXml = `
              <ws:createSession>
                 <arg0>
                    <username>${this.username}</username>
                    <password>${this.password}</password>
                 </arg0>
              </ws:createSession>`;

            const loginRes = await this._sendSoapRequest('createSession', loginXml);

            if (loginRes.statusCode !== 200) {
                console.error('[SLT Mobitel] Login Failed:', loginRes.statusCode, loginRes.body);
                return { success: false, error: 'Login Failed ' + loginRes.statusCode };
            }

            const returnBlock = loginRes.body.match(/<return>(.*?)<\/return>/s)?.[1];
            if (!returnBlock) {
                console.error('[SLT Mobitel] Failed to parse session:', loginRes.body);
                return { success: false, error: 'Session Parse Error' };
            }

            // 2. Send Message
            const msgXml = `
              <ws:sendMessages>
                 <arg0>${returnBlock}</arg0>
                 <arg1>
                    <message>${message}</message>
                    <recipients>${to}</recipients>
                    <sender>
                       <alias>${this.senderId}</alias>
                    </sender>
                    <messageType>1</messageType>
                 </arg1>
              </ws:sendMessages>`;

            const sendRes = await this._sendSoapRequest('sendMessages', msgXml);

            if (sendRes.statusCode === 200) {
                const result = this._extractTag(sendRes.body, 'return');
                // SOAP return is likely '1' for success ? Or '200'? WSDL says return int.
                console.log(`[SLT Mobitel] Sent Success. Return Code: ${result}`);

                // 3. Close Session (Fire and forget)
                const closeXml = `<ws:closeSession><arg0>${returnBlock}</arg0></ws:closeSession>`;
                this._sendSoapRequest('closeSession', closeXml).catch(() => { });

                return { success: true, id: result };
            } else {
                console.error('[SLT Mobitel] Send Failed:', sendRes.statusCode, sendRes.body);
                return { success: false, error: 'Send Failed ' + sendRes.statusCode };
            }

        } catch (e) {
            console.error('[SLT Mobitel] Error:', e);
            return { success: false, error: e.message };
        }
    }
}

class SmsService {
    constructor() {
        const { MOBITEL_USERNAME, MOBITEL_PASSWORD, MOBITEL_API_URL, MOBITEL_SENDER_ID } = process.env;

        // Check if username/password exist
        if (MOBITEL_USERNAME && MOBITEL_PASSWORD) {
            console.log('>>> SMS Service: Using SLT Mobitel Provider (SOAP)');
            this.provider = new SltMobitelProvider(
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
        // Sanitize: 947XXXXXXXX format preferred by Mobitel
        const cleanMobile = mobile.replace(/^\+/, '');
        console.log(`[SMS] Sanitized ${mobile} -> ${cleanMobile}`);

        const message = `Your Nature Farming OTP is: ${otp}. Valid for 2 minutes.`;
        return this.provider.sendSMS(cleanMobile, message);
    }

    async sendBillSMS(mobile, billData) {
        const cleanMobile = mobile.replace(/^\+/, '');
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
}

module.exports = new SmsService();
