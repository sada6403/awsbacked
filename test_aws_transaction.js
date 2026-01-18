const http = require('http');

const payload = {
    transactionType: 'BUY',
    memberId: '696cb7e3b8ad5a009ac3a100',
    fieldVisitorId: '6951dd01706240ed917886f4',
    productId: 'PROD-ALOV-001',
    companyId: 'company-001',
    quantity: 25,
    unitType: 'Kg',
    unitPrice: 100.0
};

const data = JSON.stringify(payload);

const options = {
    hostname: '16.16.64.104',
    port: 3000,
    path: '/api/transactions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTUxZGQwMTcwNjI0MGVkOTE3ODg2ZjQiLCJyb2xlIjoiZmllbGRfdmlzaXRvciIsImlhdCI6MTczNzE5MzE3NH0.dummytoken'
    }
};

console.log('Testing AWS Transaction API...');
console.log('Payload:', payload);

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('\n=== RESPONSE ===');
        console.log('Status:', res.statusCode);
        console.log('Body:', body);

        if (res.statusCode === 500) {
            console.log('\n❌ SERVER ERROR (500)');
            try {
                const json = JSON.parse(body);
                console.log('Error Message:', json.message);
            } catch (e) {
                console.log('Raw Error:', body);
            }
        } else if (res.statusCode === 201 || res.statusCode === 200) {
            console.log('\n✅ SUCCESS');
        }
    });
});

req.on('error', (error) => {
    console.error('Request Error:', error);
});

req.write(data);
req.end();
