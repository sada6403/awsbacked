const cacheService = require('./services/cacheService');

async function testCache() {
    console.log('--- Cache Service Test ---');

    const testKey = 'test_key';
    const testVal = { data: 'hello world' };

    // Test Set/Get
    console.log('Testing Set...');
    cacheService.set(testKey, testVal);

    console.log('Testing Get...');
    const retrieved = cacheService.get(testKey);
    console.log('Retrieved:', retrieved);

    if (JSON.stringify(retrieved) === JSON.stringify(testVal)) {
        console.log('✅ PASS: Set/Get successful.');
    } else {
        console.error('❌ FAIL: Set/Get failed.');
    }

    // Test Pattern Deletion
    console.log('Testing Multiple Keys...');
    cacheService.set('user_1_data', 'foo');
    cacheService.set('user_2_data', 'bar');
    cacheService.set('other_data', 'baz');

    console.log('Testing delStartWith("user_")...');
    cacheService.delStartWith('user_');

    const user1 = cacheService.get('user_1_data');
    const user2 = cacheService.get('user_2_data');
    const other = cacheService.get('other_data');

    if (user1 === undefined && user2 === undefined && other === 'baz') {
        console.log('✅ PASS: delStartWith works correctly.');
    } else {
        console.error('❌ FAIL: delStartWith failed.');
        console.log({ user1, user2, other });
    }

    console.log('--- Test Finished ---');
}

testCache();
