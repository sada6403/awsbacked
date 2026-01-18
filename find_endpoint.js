require('dotenv').config();
const http = require('http');

const ENDPOINTS = [
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS',
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS.php',
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/services/EnterpriseSMSWS',
    'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSImplService'
];

function check(url) {
    return new Promise(resolve => {
        const body = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.esms.mobitel.lk/">
   <soapenv:Header/>
   <soapenv:Body>
      <ws:createSession>
         <arg0>
            <username>${process.env.MOBITEL_USERNAME}</username>
            <password>${process.env.MOBITEL_PASSWORD}</password>
         </arg0>
      </ws:createSession>
   </soapenv:Body>
</soapenv:Envelope>`.trim();

        const urlObj = new URL(url);
        const req = http.request({
            hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode === 200 && data.includes('sessionId')) {
                    console.log('WORKING_ENDPOINT=' + url);
                }
                resolve();
            });
        });
        req.on('error', () => resolve());
        req.write(body);
        req.end();
    });
}

(async () => {
    for (const ep of ENDPOINTS) await check(ep);
})();
