const http = require('http');

const data = JSON.stringify({
    mobile: '0000000000',
    otp: '000000'
});

const options = {
    hostname: '16.16.64.104',
    port: 3000,
    path: '/api/auth/otp/verify',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);

        if (body.includes('No OTP found for this number/email')) {
            console.log('RESULT: SERVER IS UPDATED (New Code)');
        } else if (body.includes('No OTP found for this number')) {
            console.log('RESULT: SERVER IS OUTDATED (Old Code)');
        } else {
            console.log('RESULT: UNKNOWN RESPONSE');
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
