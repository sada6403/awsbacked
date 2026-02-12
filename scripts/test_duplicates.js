const API_URL = 'http://127.0.0.1:3000/api';
let token = '';

const testDuplicates = async () => {
    try {
        // 1. Login to get token
        console.log('Logging in...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: 'FV-KM-002',
                password: 'password'
            })
        });
        const loginData = await loginRes.json();
        token = loginData.token;
        console.log('Login successful.');

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // 2. Test Duplicate Member Registration
        console.log('\n--- Testing Duplicate Member ---');
        const memberData = {
            name: 'Test Duplicate',
            address: '123 Test St',
            mobile: '0779998881',
            nic: '998877661V'
        };

        const memReqs = [
            fetch(`${API_URL}/members`, { method: 'POST', headers, body: JSON.stringify(memberData) }),
            fetch(`${API_URL}/members`, { method: 'POST', headers, body: JSON.stringify(memberData) }),
            fetch(`${API_URL}/members`, { method: 'POST', headers, body: JSON.stringify(memberData) })
        ];

        const memResults = await Promise.allSettled(memReqs);
        for (let i = 0; i < memResults.length; i++) {
            const res = memResults[i];
            if (res.status === 'fulfilled') {
                const data = await res.value.json();
                console.log(`Req ${i + 1}: Status ${res.value.status}, created: ${data.created}, message: ${data.message}`);
            } else {
                console.log(`Req ${i + 1}: FAILED ${res.reason.message}`);
            }
        }

        // 3. Test Duplicate Transaction
        console.log('\n--- Testing Duplicate Transaction ---');
        const memGetRes = await fetch(`${API_URL}/members`, { headers });
        const memGetData = await memGetRes.json();
        const member = memGetData.data[0];

        if (!member) throw new Error('No members found to test transactions');

        const txData = {
            transactionType: 'BUY',
            memberId: member.id || member._id,
            fieldVisitorId: 'FV-KM-002',
            productId: 'PROD-ALOV-001',
            quantity: 10,
            unitType: 'Kg',
            unitPrice: 50
        };

        const txReqs = [
            fetch(`${API_URL}/transactions`, { method: 'POST', headers, body: JSON.stringify(txData) }),
            fetch(`${API_URL}/transactions`, { method: 'POST', headers, body: JSON.stringify(txData) }),
            fetch(`${API_URL}/transactions`, { method: 'POST', headers, body: JSON.stringify(txData) })
        ];

        const txResults = await Promise.allSettled(txReqs);
        for (let i = 0; i < txResults.length; i++) {
            const res = txResults[i];
            if (res.status === 'fulfilled') {
                const data = await res.value.json();
                console.log(`Req ${i + 1}: Status ${res.value.status}, created: ${data.created}, message: ${data.message}, bill: ${data.data ? data.data.billNumber : 'N/A'}`);
            } else {
                console.log(`Req ${i + 1}: FAILED ${res.reason.message}`);
            }
        }

    } catch (e) {
        console.error('Test FAILED with error:');
        console.error(e);
        if (e.cause) console.error('Cause:', e.cause);
    }
};

testDuplicates();
