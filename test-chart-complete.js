const http = require('http');

// Test complete chart data flow
async function testChartData() {
    console.log('=== Testing Pie Chart Data Flow ===\n');
    
    // Login
    const loginData = JSON.stringify({
        username: 'FV-KM-001',
        password: 'password123',
        role: 'field'
    });
    
    const loginPromise = new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': loginData.length
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const data = JSON.parse(body);
                    resolve(data.data.token);
                } else {
                    reject(new Error(`Login failed: ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.write(loginData);
        req.end();
    });
    
    const token = await loginPromise;
    console.log('✅ Login successful\n');
    
    // Get dashboard stats
    const statsPromise = new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3000,
            path: '/api/reports/dashboard-stats',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(body).data);
                } else {
                    reject(new Error(`Stats failed: ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
    
    const stats = await statsPromise;
    
    console.log('📊 DASHBOARD DATA:\n');
    console.log('Monthly Totals:');
    console.log(`  - Buy Amount: Rs. ${stats.monthlyTotals.buyAmount.toLocaleString()}`);
    console.log(`  - Sell Amount: Rs. ${stats.monthlyTotals.sellAmount.toLocaleString()}`);
    console.log(`  - Total: Rs. ${stats.monthlyTotals.totalAmount.toLocaleString()}\n`);
    
    console.log('📈 BUY PIE CHART DATA:');
    console.log(`  - This Visitor: ${stats.buyPieChart.thisVisitor} KG`);
    console.log(`  - Others: ${stats.buyPieChart.others} KG`);
    console.log(`  - Total: ${stats.buyPieChart.total} KG`);
    const buyPercent = stats.buyPieChart.total > 0 
        ? ((stats.buyPieChart.thisVisitor / stats.buyPieChart.total) * 100).toFixed(1)
        : 0;
    console.log(`  - This Visitor Share: ${buyPercent}%\n`);
    
    console.log('📉 SELL PIE CHART DATA:');
    console.log(`  - This Visitor: ${stats.sellPieChart.thisVisitor} KG`);
    console.log(`  - Others: ${stats.sellPieChart.others} KG`);
    console.log(`  - Total: ${stats.sellPieChart.total} KG`);
    const sellPercent = stats.sellPieChart.total > 0 
        ? ((stats.sellPieChart.thisVisitor / stats.sellPieChart.total) * 100).toFixed(1)
        : 0;
    console.log(`  - This Visitor Share: ${sellPercent}%\n`);
    
    console.log('✅ Pie chart data successfully connected!');
    console.log('\n💡 Flutter app will now show:');
    console.log(`   - Buy Chart: ${stats.buyPieChart.total} KG (${buyPercent}% This Visitor)`);
    console.log(`   - Sell Chart: ${stats.sellPieChart.total} KG (${sellPercent}% This Visitor)`);
}

testChartData().catch(err => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
});
