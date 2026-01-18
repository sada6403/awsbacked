const http = require('http');

// Configuration
const HOST = '16.16.64.104';
const PORT = 3000;
const MEMBER_PHONE = '703027685'; // User provided number
// Default credentials from seed.js
const CREDENTIALS = {
    username: 'FV001',
    password: 'password123',
    role: 'field_visitor'
};

// Helper for HTTP Request
const request = (method, path, data, token = null) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            port: PORT,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
};

const run = async () => {
    console.log(`--- Sending Random Bill to ${MEMBER_PHONE} ---`);
    console.log(`Target: http://${HOST}:${PORT}/api`);

    try {
        // 1. Login
        console.log(`\n[1] Logging in as ${CREDENTIALS.username}...`);
        const loginRes = await request('POST', '/auth/login', CREDENTIALS);

        console.log('Login Status:', loginRes.statusCode);

        if (!loginRes.body || !loginRes.body.success) {
            console.log('FV001 login failed/invalid. Trying Admin...');
            const adminCreds = { username: 'admin@nf.com', password: 'password123', role: 'manager' };
            const adminLogin = await request('POST', '/auth/login', adminCreds);
            if (!adminLogin.body || !adminLogin.body.success) {
                console.error('❌ Login Failed.');
                console.error('FV Response:', loginRes.body);
                console.error('Admin Response:', adminLogin.body);
                return;
            }
            CREDENTIALS.token = adminLogin.body.token;
            console.log('✅ Admin Login Successful');
        } else {
            CREDENTIALS.token = loginRes.body.token;
            console.log('✅ FV Login Successful');
        }

        // 2. Find Member
        console.log(`\n[2] Searching for member ${MEMBER_PHONE}...`);
        const membersRes = await request('GET', `/members?search=${MEMBER_PHONE}`, null, CREDENTIALS.token);

        if (!membersRes.body || !membersRes.body.success) {
            console.error('❌ Failed to fetch members.');
            console.error(membersRes.body);
            return;
        }

        let member = null;
        if (membersRes.body.data && membersRes.body.data.length > 0) {
            member = membersRes.body.data.find(m => m.mobile && m.mobile.includes(MEMBER_PHONE));
        }

        if (!member) {
            console.error(`❌ Member not found with phone ${MEMBER_PHONE}`);
            if (membersRes.body.data) console.log('Found members:', membersRes.body.data.map(m => m.mobile));
            return;
        }
        console.log(`✅ Member Found: ${member.name} (ID: ${member._id || member.id})`);

        // 3. Create Transaction
        const fvId = member.fieldVisitorId;
        console.log(`Using FieldVisitorID from Member: ${fvId}`);

        if (!fvId) {
            console.error('❌ Member has no fieldVisitorId. Cannot create transaction.');
            return;
        }

        const payload = {
            transactionType: 'BUY',
            memberId: member._id || member.id,
            fieldVisitorId: fvId,
            productId: 'prod-001', // Fallback
            quantity: 5, // Random 5kg
            unitType: 'Kg',
            unitPrice: 100
        };

        // Fetch products to get a valid ID
        const prodRes = await request('GET', '/products', null, CREDENTIALS.token);
        if (prodRes.body && prodRes.body.length > 0) {
            const prod = prodRes.body[0];
            payload.productId = prod.productId || prod._id; // Ensure we use the right ID
            console.log(`Selected Product: ${prod.name} (ID:${payload.productId})`);
        } else {
            console.warn('⚠️ Could not fetch products. Using default prod-001');
        }

        console.log(`\n[3] Creating Transaction...`);
        const txRes = await request('POST', '/transactions', payload, CREDENTIALS.token);

        if (txRes.body && txRes.body.success) {
            console.log(`\n✅ SUCCESS! Bill Sent.`);
            console.log(`Bill Number: ${txRes.body.data.billNumber}`);
            console.log(`Total Amount: ${txRes.body.data.totalAmount}`);
        } else {
            console.error(`\n❌ Transaction Failed: ${txRes.statusCode}`);
            console.error(JSON.stringify(txRes.body, null, 2));
        }

    } catch (e) {
        console.error('Script Error:', e.message);
    }
};

run();
