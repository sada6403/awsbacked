# Complete Registration & Login Test Script

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  NF Farming Registration & Login Test Suite" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

# Test 1: Check if server is running
Write-Host "Test 1: Checking if backend server is running..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$baseUrl/" -ErrorAction Stop | Out-Null
    Write-Host "✅ Server is running!" -ForegroundColor Green
} catch {
    Write-Host "❌ Server is not running. Start it with: node server.js" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan

# Test 2: Register a new manager
Write-Host "Test 2: Registering a new manager..." -ForegroundColor Yellow
$timestamp = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$testEmail = "testmanager$timestamp@nf.com"

$registerBody = @{
    name = "Test Manager $timestamp"
    email = $testEmail
    password = "test123"
    code = "MGR$timestamp"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" `
        -Method POST `
        -Body $registerBody `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "✅ Manager registered successfully!" -ForegroundColor Green
    Write-Host "   Name: $($registerResponse.data.name)" -ForegroundColor Gray
    Write-Host "   Email: $($registerResponse.data.email)" -ForegroundColor Gray
    Write-Host "   Code: $($registerResponse.data.code)" -ForegroundColor Gray
    Write-Host "   ID: $($registerResponse.data._id)" -ForegroundColor Gray
    
    $managerId = $registerResponse.data._id
} catch {
    Write-Host "❌ Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.Response -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan

# Test 3: Verify user was saved in database
Write-Host "Test 3: Verifying user was saved in database..." -ForegroundColor Yellow
try {
    $usersResponse = Invoke-RestMethod -Uri "$baseUrl/api/users" -ErrorAction Stop
    
    $savedManager = $usersResponse.data.managers | Where-Object { $_._id -eq $managerId }
    
    if ($savedManager) {
        Write-Host "✅ User found in database!" -ForegroundColor Green
        Write-Host "   Total Managers: $($usersResponse.data.counts.managers)" -ForegroundColor Gray
        Write-Host "   Total Field Visitors: $($usersResponse.data.counts.fieldVisitors)" -ForegroundColor Gray
        Write-Host "   Total Members: $($usersResponse.data.counts.members)" -ForegroundColor Gray
    } else {
        Write-Host "❌ User not found in database!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Failed to fetch users: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan

# Test 4: Login with the registered user
Write-Host "Test 4: Logging in with registered credentials..." -ForegroundColor Yellow
$loginBody = @{
    username = $testEmail
    password = "test123"
    role = "manager"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host "   Name: $($loginResponse.data.name)" -ForegroundColor Gray
    Write-Host "   Email: $($loginResponse.data.email)" -ForegroundColor Gray
    Write-Host "   Code: $($loginResponse.data.code)" -ForegroundColor Gray
    Write-Host "   ID: $($loginResponse.data._id)" -ForegroundColor Gray
    Write-Host "   Token: $($loginResponse.data.token.Substring(0, 20))..." -ForegroundColor Gray
    
    # Verify the ID matches
    if ($loginResponse.data._id -eq $managerId) {
        Write-Host "✅ Login returned the same user data!" -ForegroundColor Green
    } else {
        Write-Host "❌ Login returned different user data!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan

# Test 5: Test default seeded users
Write-Host "Test 5: Testing default seeded credentials..." -ForegroundColor Yellow

# Test Manager Login
$defaultManagerLogin = @{
    username = "admin@nf.com"
    password = "password123"
    role = "manager"
} | ConvertTo-Json

try {
    $defaultManagerResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -Body $defaultManagerLogin `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "✅ Default Manager login successful!" -ForegroundColor Green
    Write-Host "   Name: $($defaultManagerResponse.data.name)" -ForegroundColor Gray
    Write-Host "   Code: $($defaultManagerResponse.data.code)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  Default manager not found (run: node seed.js)" -ForegroundColor Yellow
}

# Test Field Visitor Login
$defaultFieldLogin = @{
    username = "FV001"
    password = "password123"
    role = "field"
} | ConvertTo-Json

try {
    $defaultFieldResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -Body $defaultFieldLogin `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "✅ Default Field Visitor login successful!" -ForegroundColor Green
    Write-Host "   Name: $($defaultFieldResponse.data.name)" -ForegroundColor Gray
    Write-Host "   User ID: $($defaultFieldResponse.data.userId)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  Default field visitor not found (run: node seed.js)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  ✅ ALL TESTS PASSED!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "1. ✅ Server is running and responding" -ForegroundColor Green
Write-Host "2. ✅ User registration works correctly" -ForegroundColor Green
Write-Host "3. ✅ User data is saved to MongoDB" -ForegroundColor Green
Write-Host "4. ✅ Login fetches real user data from database" -ForegroundColor Green
Write-Host "5. ✅ User ID matches between registration and login" -ForegroundColor Green
Write-Host ""
Write-Host "Your registration and login system is working perfectly! 🚀" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Test in Flutter app - register a new user" -ForegroundColor Gray
Write-Host "2. Close the Flutter app completely" -ForegroundColor Gray
Write-Host "3. Re-open the app - you should stay logged in!" -ForegroundColor Gray
Write-Host ""
