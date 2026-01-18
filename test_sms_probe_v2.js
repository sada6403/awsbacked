const https = require('https');
const http = require('http');

const urls = [
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS.wsdl',
    'https://msmsenterprise.mobitel.lk/index.php/home' // Login page
];

async function check(url) {
    console.log(`Checking ${url}...`);
    return new Promise(resolve => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                console.log(`[${res.statusCode}] Length: ${data.length}`);
                if (data.includes('definitions') || data.includes('wsdl:')) {
                    console.log('>>> FOUND WSDL!');
                }
                if (data.includes('login') || data.includes('Login')) {
                    console.log('>>> FOUND LOGIN PAGE!');
                }
                resolve();
            });
        });
        req.on('error', e => {
            console.log(`[ERR] ${e.message}`);
            resolve();
        });
        req.setTimeout(5000, () => {
            req.abort();
            console.log('[TIMEOUT]');
            resolve();
        });
    });
}

(async () => {
    for (const url of urls) await check(url);
})();
