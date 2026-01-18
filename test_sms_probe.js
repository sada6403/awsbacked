const https = require('https');
const http = require('http');

const endpoints = [
    'https://msmsenterprise.mobitel.lk/BulkSMS/SendSMS',
    'https://msmsenterprise.mobitel.lk/api/v1/message',
    'https://msmsenterprise.mobitel.lk/sms/send',
    'https://msmsenterprise.mobitel.lk/sendsms.php',
    'https://msmsenterprise.mobitel.lk/http_api.php',
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS.wsdl', // Check if this host is alive
    'https://msmsenterprise.mobitel.lk/EnterpriseSMS/EnterpriseSMSWS.wsdl' // Check if migrated here
];

async function checkUrl(url) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const title = data.match(/<title>(.*?)<\/title>/)?.[1] || 'No Title';
                const isHtml = data.includes('<html');
                const len = data.length;
                console.log(`[${res.statusCode}] ${url} - Title: ${title}, Len: ${len}, HTML: ${isHtml}`);
                resolve();
            });
        });

        req.on('error', (e) => {
            console.log(`[ERR] ${url} - ${e.message}`);
            resolve();
        });

        req.setTimeout(5000, () => {
            req.abort();
            console.log(`[TIMEOUT] ${url}`);
            resolve();
        });
    });
}

async function run() {
    console.log('Probing Mobitel Endpoints...');
    for (const url of endpoints) {
        await checkUrl(url);
    }
}

run();
