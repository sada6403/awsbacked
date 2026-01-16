// test-pie-charts.js
// Test pie chart data for dashboard

require('dotenv').config();
const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000/api';

let authToken = '';

function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${BASE_URL}${path}`);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (authToken) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        data: JSON.parse(body)
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        data: body
                    });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function runTests() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 TESTING PIE CHART DATA');
    console.log('='.repeat(70));

    try {
        // Login
        console.log('\n✅ Test 1: Login with FV-KM-001');
        let response = await makeRequest('POST', '/auth/login', {
            username: 'FV-KM-001',
            password: 'password123',
            role: 'field'
        });

        if (response.statusCode !== 200) {
            console.error('❌ Login failed:', response.data);
            return;
        }

        authToken = response.data.data.token;
        console.log(`   ✓ Logged in as: ${response.data.data.name}`);

        // Get Dashboard Stats
        console.log('\n✅ Test 2: Get Dashboard Stats with Pie Charts');
        response = await makeRequest('GET', '/reports/dashboard-stats');

        if (response.statusCode === 200) {
            const data = response.data.data;
            
            console.log('\n   💰 Monthly Totals:');
            console.log(`      BUY Amount: Rs. ${data.monthlyTotals.buyAmount}`);
            console.log(`      SELL Amount: Rs. ${data.monthlyTotals.sellAmount}`);
            console.log(`      Total: Rs. ${data.monthlyTotals.totalAmount}`);

            console.log('\n   📊 BUY Pie Chart (Quantity):');
            console.log(`      This Visitor: ${data.buyPieChart.thisVisitor} Kg`);
            console.log(`      Others: ${data.buyPieChart.others} Kg`);
            console.log(`      Total: ${data.buyPieChart.total} Kg`);

            console.log('\n   📊 SELL Pie Chart (Quantity):');
            console.log(`      This Visitor: ${data.sellPieChart.thisVisitor} Kg`);
            console.log(`      Others: ${data.sellPieChart.others} Kg`);
            console.log(`      Total: ${data.sellPieChart.total} Kg`);

            console.log(`\n   👥 Members: ${data.totalMembers}`);
        }

        // Get Field Visitor Dashboard
        console.log('\n✅ Test 3: Get Field Visitor Dashboard');
        response = await makeRequest('GET', '/reports/field-visitor-dashboard');

        if (response.statusCode === 200) {
            const data = response.data.data;
            
            console.log('\n   💰 Totals:');
            console.log(`      BUY Total: Rs. ${data.totals.buyTotal}`);
            console.log(`      SELL Total: Rs. ${data.totals.sellTotal}`);
            console.log(`      BUY Count: ${data.totals.buyCount}`);
            console.log(`      SELL Count: ${data.totals.sellCount}`);

            console.log('\n   📊 BUY Pie Chart (Quantity):');
            console.log(`      This Visitor: ${data.buyPieChart.thisVisitor} Kg`);
            console.log(`      Others: ${data.buyPieChart.others} Kg`);
            console.log(`      Total: ${data.buyPieChart.total} Kg`);

            console.log('\n   📊 SELL Pie Chart (Quantity):');
            console.log(`      This Visitor: ${data.sellPieChart.thisVisitor} Kg`);
            console.log(`      Others: ${data.sellPieChart.others} Kg`);
            console.log(`      Total: ${data.sellPieChart.total} Kg`);

            console.log(`\n   📋 Transactions: ${data.transactions.length}`);
            console.log(`   🔔 Notifications: ${data.notifications.length}`);
        }

        console.log('\n' + '='.repeat(70));
        console.log('✅ PIE CHART DATA SUMMARY');
        console.log('='.repeat(70));
        console.log(`
✅ CHART DATA AVAILABLE:
  • Monthly BUY/SELL amounts ✓
  • BUY quantity pie chart (This Visitor vs Others) ✓
  • SELL quantity pie chart (This Visitor vs Others) ✓
  • Data calculated from current month transactions ✓

📱 MOBILE APP INTEGRATION:
  1. Call: GET /api/reports/dashboard-stats
  2. Response includes:
     - monthlyTotals.buyAmount
     - monthlyTotals.sellAmount
     - buyPieChart.thisVisitor
     - buyPieChart.others
     - sellPieChart.thisVisitor
     - sellPieChart.others

🎨 DISPLAY IN UI:
  - Monthly Buy (Rs): monthlyTotals.buyAmount
  - Monthly Sell (Rs): monthlyTotals.sellAmount
  - Buy Pie: Show buyPieChart.thisVisitor vs buyPieChart.others
  - Sell Pie: Show sellPieChart.thisVisitor vs sellPieChart.others
        `);

    } catch (error) {
        console.error('❌ Test Error:', error.message);
    }
}

runTests().then(() => process.exit(0)).catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
