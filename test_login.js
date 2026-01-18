const http = require('http');

function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });

        req.on('error', (e) => reject(e));
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function test() {
    try {
        console.log('Fetching users...');
        const userRes = await makeRequest('/users');
        if (userRes.statusCode !== 200) {
            console.error('Failed to get users:', userRes.statusCode);
            return;
        }

        const users = JSON.parse(userRes.body);
        const visitor = users.data.fieldVisitors[0];

        if (!visitor) {
            console.log('No field visitors found');
            return;
        }

        console.log('Found visitor:', visitor.userId);

        console.log('Attempting login with WRONG password...');
        try {
            const loginRes = await makeRequest('/auth/login', 'POST', {
                username: visitor.userId,
                password: 'wrongpassword123',
                role: 'field'
            });

            console.log('Login Response Status:', loginRes.statusCode);
            console.log('Login Response Body:', loginRes.body);
        } catch (e) {
            console.error('Login request failed (network error):', e.message);
        }

    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
