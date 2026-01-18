const http = require('http');

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api' + path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    try {
        const suffix = Date.now();

        // --- KALMUNAI TEST ---
        console.log('1. Registering Manager (Kalmunai)...');
        const mgrRes = await request('/auth/register', 'POST', {
            fullName: 'Test Mgr ' + suffix,
            email: `testmgr${suffix}@ex.com`,
            password: '123',
            userId: `MGR${suffix}`,
            branchName: 'Kalmunai',
            branchId: `branch-kal-${suffix}`,
            phone: '0770000001'
        });

        if (!mgrRes.success) throw new Error('Mgr Reg Failed: ' + mgrRes.message);
        const mgrToken = mgrRes.data.token;
        console.log('   Manager Registered.');

        console.log('2. Registering Field Visitor (Kalmunai)...');
        const fvRes = await request('/fieldvisitors', 'POST', {
            name: 'FV Kalmunai',
            phone: '0771111111',
            branch: 'Kalmunai',
            bankDetails: { bankName: 'BOC', accountNumber: '123' }
        }, mgrToken); // Auth as Manager

        if (!fvRes.success) throw new Error('FV Reg Failed: ' + fvRes.message);
        const fvUser = fvRes.data;
        console.log(`   FV Registered: ${fvUser.userId} / ${fvUser.tempPassword}`);

        console.log('3. Login as Field Visitor...');
        const loginRes = await request('/auth/login', 'POST', {
            username: fvUser.userId,
            password: fvUser.tempPassword,
            role: 'field'
        });

        if (!loginRes.success) throw new Error('FV Login Failed: ' + loginRes.message);
        const fvToken = loginRes.data.token;
        console.log('   FV Logged In.');

        console.log('4. Adding Member 1...');
        const m1 = await request('/members', 'POST', {
            name: 'Mem 1', address: 'Addr 1', mobile: '0771234567', nic: '123456789V'
        }, fvToken);

        console.log('   Member 1 Result:', m1.success ? m1.data.memberCode : m1.message);
        if (m1.success && m1.data.memberCode !== 'FAKA001') console.error('FAIL: Expected FAKA001');

        console.log('5. Adding Member 2...');
        const m2 = await request('/members', 'POST', {
            name: 'Mem 2', address: 'Addr 2', mobile: '0771234568', nic: '123456788V'
        }, fvToken);

        console.log('   Member 2 Result:', m2.success ? m2.data.memberCode : m2.message);
        if (m2.success && m2.data.memberCode !== 'FAKA002') console.error('FAIL: Expected FAKA002');


        // --- TRINCOMALEE TEST ---
        console.log('6. Registering Manager (Trinco)...');
        const trRes = await request('/auth/register', 'POST', {
            fullName: 'Trinco Mgr ' + suffix,
            email: `trmgr${suffix}@ex.com`,
            password: '123',
            userId: `TRMGR${suffix}`,
            branchName: 'Trincomalee',
            branchId: `branch-tri-${suffix}`,
            phone: '0770000002'
        });
        const trMgrToken = trRes.data.token;

        console.log('7. Registering Field Visitor (Trinco)...');
        const trFvRes = await request('/fieldvisitors', 'POST', {
            name: 'FV Trinco',
            phone: '0772222222',
            branch: 'Trincomalee',
            bankDetails: { bankName: 'BOC', accountNumber: '456' }
        }, trMgrToken);

        if (!trFvRes.success) throw new Error('FV Trinco Reg Failed: ' + trFvRes.message);
        const trFvUser = trFvRes.data;

        console.log('8. Login as Trinco FV...');
        const trLoginRes = await request('/auth/login', 'POST', {
            username: trFvUser.userId,
            password: trFvUser.tempPassword,
            role: 'field'
        });
        const trFvToken = trLoginRes.data.token;

        console.log('9. Adding Member Trinco...');
        const mTr = await request('/members', 'POST', {
            name: 'Mem Tr', address: 'Addr Tr', mobile: '0771112223', nic: '999999999V'
        }, trFvToken);

        console.log('   Trinco Member Result:', mTr.success ? mTr.data.memberCode : mTr.message);
        if (mTr.success && mTr.data.memberCode !== 'FATR001') console.error('FAIL: Expected FATR001');

    } catch (e) {
        console.error('Test Error:', e.message);
    }
}

test();
