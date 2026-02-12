const API_URL = 'http://127.0.0.1:3000/api';

async function run() {
    try {
        console.log('1. Logging in...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: 'FV-KM-002', password: 'password' })
        });
        const { token } = await loginRes.json();
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

        console.log('\n2. First Member Registration...');
        const memberData = { name: 'Test Seq', address: 'Test', mobile: '0770000001', nic: '000000001V' };
        const res1 = await fetch(`${API_URL}/members`, { method: 'POST', headers, body: JSON.stringify(memberData) });
        const data1 = await res1.json();
        console.log('Res 1:', res1.status, data1.message, 'Created:', data1.created);

        console.log('\n3. Second Member Registration (Same Data)...');
        const res2 = await fetch(`${API_URL}/members`, { method: 'POST', headers, body: JSON.stringify(memberData) });
        const data2 = await res2.json();
        console.log('Res 2:', res2.status, data2.message, 'Created:', data2.created);

        console.log('\n4. First Transaction...');
        const txData = {
            transactionType: 'BUY',
            memberId: data1.data._id,
            fieldVisitorId: 'FV-KM-002',
            productId: 'PROD-ALOV-001',
            quantity: 5,
            unitType: 'Kg',
            unitPrice: 10
        };
        const res3 = await fetch(`${API_URL}/transactions`, { method: 'POST', headers, body: JSON.stringify(txData) });
        const data3 = await res3.json();
        console.log('Res 3:', res3.status, data3.message, 'Created:', data3.created, 'Bill:', data3.data.billNumber);

        console.log('\n5. Second Transaction (Duplicate Window)...');
        const res4 = await fetch(`${API_URL}/transactions`, { method: 'POST', headers, body: JSON.stringify(txData) });
        const data4 = await res4.json();
        console.log('Res 4:', res4.status, data4.message, 'Created:', data4.created, 'Bill:', data4.data.billNumber);

    } catch (e) {
        console.error(e);
    }
}

run();
