require('dotenv').config();
const http = require('http');

const ENDPOINTS = [
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS',
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS.php',
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSImplService',
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/services/EnterpriseSMSWS'
];

function sendSoap(url, action, bodyXml) {
    return new Promise((resolve, reject) => {
        const envelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.esms.mobitel.lk/">
   <soapenv:Header/>
   <soapenv:Body>
      ${bodyXml}
   </soapenv:Body>
</soapenv:Envelope>`.trim();

        const urlObj = new URL(url);
        const opts = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml;charset=UTF-8',
                'Content-Length': Buffer.byteLength(envelope),
                'SOAPAction': '',
                'User-Agent': 'NodeJS SOAP Client'
            }
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ url, statusCode: res.statusCode, headers: res.headers, body: data }));
        });

        req.on('error', (e) => resolve({ url, error: e.message }));
        req.write(envelope);
        req.end();
    });
}

function parseTag(xml, tagName) {
    const match = xml.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`));
    return match ? match[1] : null;
}

async function run() {
    const mobile = process.argv[2] || '0771234567';
    console.log(`Testing SOAP to ${mobile}...`);

    const loginXml = `
      <ws:createSession>
         <arg0>
            <username>${process.env.MOBITEL_USERNAME}</username>
            <password>${process.env.MOBITEL_PASSWORD}</password>
         </arg0>
      </ws:createSession>`;

    for (const ep of ENDPOINTS) {
        console.log(`\n--- Probing ${ep} ---`);
        const loginRes = await sendSoap(ep, 'createSession', loginXml);

        if (loginRes.error) {
            console.log('Error:', loginRes.error);
            continue;
        }

        console.log('Status:', loginRes.statusCode);
        console.log('Body Preview:', loginRes.body.replace(/\s+/g, ' ').substring(0, 300));

        if (loginRes.statusCode === 200 && (loginRes.body.includes('sessionId') || loginRes.body.includes('return'))) {
            console.log('>>> SUCCESS! Found correct endpoint.');

            const returnBlock = loginRes.body.match(/<return>(.*?)<\/return>/s)?.[1];
            const sessionId = parseTag(loginRes.body, 'sessionId');

            if (sessionId && returnBlock) {
                console.log('Got SessionId:', sessionId);
                // Try Send
                const sessionArg = `<arg0>${returnBlock}</arg0>`;
                const msgXml = `
                  <ws:sendMessages>
                     ${sessionArg}
                     <arg1>
                        <message>Test OTP 123 from NF Farming</message>
                        <recipients>${mobile}</recipients>
                        <sender>
                           <alias>${process.env.MOBITEL_SENDER_ID || 'NF Farming'}</alias>
                        </sender>
                        <messageType>1</messageType>
                     </arg1>
                  </ws:sendMessages>`;

                const sendRes = await sendSoap(ep, 'sendMessages', msgXml);
                console.log('Send Status:', sendRes.statusCode);
                console.log('Send Body:', sendRes.body);
                break; // Stop after success
            }
        }
    }
}

run();
