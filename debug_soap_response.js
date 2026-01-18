require('dotenv').config();
const https = require('https');
const http = require('http');

const API_URL = process.env.MOBITEL_API_URL;
const USERNAME = process.env.MOBITEL_USERNAME;
const PASSWORD = process.env.MOBITEL_PASSWORD;
const SENDER_ID = process.env.MOBITEL_SENDER_ID;

function sendSoap(bodyXml) {
    return new Promise((resolve, reject) => {
        const envelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.esms.mobitel.lk/">
   <soapenv:Header/>
   <soapenv:Body>
      ${bodyXml}
   </soapenv:Body>
</soapenv:Envelope>`.trim();

        const urlObj = new URL(API_URL);
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
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });

        req.on('error', (e) => reject(e));
        req.write(envelope);
        req.end();
    });
}

async function run() {
    const mobile = process.argv[2] || '0771234567';
    console.log(`Debug Sending to ${mobile}...`);

    // 1. Login
    const loginXml = `
      <ws:createSession>
         <arg0>
            <username>${USERNAME}</username>
            <password>${PASSWORD}</password>
         </arg0>
      </ws:createSession>`;

    console.log('--- LOGIN REQUEST ---');
    const loginRes = await sendSoap(loginXml);
    console.log(`Status: ${loginRes.statusCode}`);
    console.log('Body:', loginRes.body);

    const returnBlock = loginRes.body.match(/<return>(.*?)<\/return>/s)?.[1];
    if (!returnBlock) {
        console.error('Login Failed to parse return block');
        return;
    }

    // 2. Send
    const msgXml = `
      <ws:sendMessages>
         <arg0>${returnBlock}</arg0>
         <arg1>
            <message>Test OTP 888888</message>
            <recipients>${mobile}</recipients>
            <sender>
               <alias>${SENDER_ID}</alias>
            </sender>
            <messageType>1</messageType>
         </arg1>
      </ws:sendMessages>`;

    console.log('--- SEND REQUEST ---');
    const sendRes = await sendSoap(msgXml);
    console.log(`Status: ${sendRes.statusCode}`);
    console.log('Body:', sendRes.body);
}

run();
