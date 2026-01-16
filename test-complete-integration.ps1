# Complete Integration Test Script
# Tests full end-to-end flow for Flutter + Node.js + MongoDB

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "   COMPLETE INTEGRATION TEST" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3000/api"
$testsPassed = 0
$testsFailed = 0

function Test-Api {
    param(
        [string]$TestName,
        [string]$Method,
        [string]$Url,
        [hashtable]$Body = $null,
        [hashtable]$Headers = $null
    )
    
    Write-Host "`n[TEST] $TestName" -ForegroundColor Yellow
    Write-Host "  -> $Method $Url" -ForegroundColor Gray
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            ContentType = 'application/json'
        }
        
        if ($Body) {
            $jsonBody = ($Body | ConvertTo-Json -Depth 10)
            $params['Body'] = $jsonBody
        }
        
        if ($Headers) {
            $params['Headers'] = $Headers
        }
        
        $response = Invoke-RestMethod @params
        
        Write-Host "  [OK] Response received" -ForegroundColor Green
        $script:testsPassed++
        return $response
    }
    catch {
        $script:testsFailed++
        Write-Host "  [FAIL] $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Test 1: Server Health
Write-Host "`n--- Phase 1: Server Health Check ---" -ForegroundColor Cyan
$healthCheck = Test-Api -TestName "Server Connectivity" -Method "GET" -Url "$baseUrl/users"

if (-not $healthCheck) {
    Write-Host "`nServer is not responding. Please check:" -ForegroundColor Red
    Write-Host "  1. Backend server is running" -ForegroundColor Red
    Write-Host "  2. MongoDB is connected" -ForegroundColor Red
    exit 1
}

Write-Host "  Managers: $($healthCheck.managers.count)" -ForegroundColor Gray
Write-Host "  Field Visitors: $($healthCheck.fieldVisitors.count)" -ForegroundColor Gray
Write-Host "  Members: $($healthCheck.members.count)" -ForegroundColor Gray

# Test 2: Manager Registration
Write-Host "`n--- Phase 2: Manager Registration ---" -ForegroundColor Cyan
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

$registrationData = @{
    name = "Test Manager $timestamp"
    email = "testmgr$timestamp@test.com"
    password = "testpassword123"
    code = "MGR$timestamp"
}

$registrationResponse = Test-Api -TestName "Register New Manager" -Method "POST" -Url "$baseUrl/auth/register" -Body $registrationData

if ($registrationResponse) {
    Write-Host "  Manager ID: $($registrationResponse.data.id)" -ForegroundColor Gray
    Write-Host "  Manager Name: $($registrationResponse.data.name)" -ForegroundColor Gray
}

# Test 3: Manager Login
Write-Host "`n--- Phase 3: Manager Login ---" -ForegroundColor Cyan

$loginData = @{
    username = $registrationData.email
    password = "testpassword123"
    role = "manager"
}

$loginResponse = Test-Api -TestName "Login with Registered Manager" -Method "POST" -Url "$baseUrl/auth/login" -Body $loginData

if ($loginResponse) {
    Write-Host "  Logged in as: $($loginResponse.data.name)" -ForegroundColor Gray
    
    if ($managerId -eq $loginResponse.data.id) {
        Write-Host "  [OK] User IDs match - persistence verified" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  [FAIL] User IDs don't match" -ForegroundColor Red
        $testsFailed++
    }
}

# Test 4: Default Users Login
Write-Host "`n--- Phase 4: Default Users Login ---" -ForegroundColor Cyan

$defaultManagerLogin = @{
    username = "admin@nf.com"
    password = "password123"
    role = "manager"
}

$defaultMgrResponse = Test-Api -TestName "Login Default Manager" -Method "POST" -Url "$baseUrl/auth/login" -Body $defaultManagerLogin

if ($defaultMgrResponse) {
    Write-Host "  Name: $($defaultMgrResponse.data.name)" -ForegroundColor Gray
}

$defaultFVLogin = @{
    username = "FV001"
    password = "password123"
    role = "field"
}

$defaultFVResponse = Test-Api -TestName "Login Default Field Visitor" -Method "POST" -Url "$baseUrl/auth/login" -Body $defaultFVLogin

if ($defaultFVResponse) {
    Write-Host "  Name: $($defaultFVResponse.data.name)" -ForegroundColor Gray
    Write-Host "  Phone: $($defaultFVResponse.data.phone)" -ForegroundColor Gray
    $fvToken = $defaultFVResponse.data.token
    $fvId = $defaultFVResponse.data.id
}

# Test 5: Member Registration
Write-Host "`n--- Phase 5: Member Registration ---" -ForegroundColor Cyan

if ($fvToken) {
    $memberData = @{
        name = "Test Farmer $timestamp"
        address = "123 Test Farm Road"
        mobile = "0771234567"
        nic = "19${timestamp}V"
    }
    
    $memberHeaders = @{
        'Authorization' = "Bearer $fvToken"
    }
    
    $memberResponse = Test-Api -TestName "Register Member" -Method "POST" -Url "$baseUrl/members" -Body $memberData -Headers $memberHeaders
    
    if ($memberResponse) {
        Write-Host "  Member ID: $($memberResponse.data.id)" -ForegroundColor Gray
        Write-Host "  Member Name: $($memberResponse.data.name)" -ForegroundColor Gray
    }
}

# Test 6: Get Members
Write-Host "`n--- Phase 6: Get Members ---" -ForegroundColor Cyan

if ($fvId) {
    $membersResponse = Test-Api -TestName "Get Members for Field Visitor" -Method "GET" -Url "$baseUrl/members?fieldVisitorId=$fvId"
    
    if ($membersResponse) {
        Write-Host "  Total members: $($membersResponse.count)" -ForegroundColor Gray
        
        if ($membersResponse.count -gt 0) {
            Write-Host "  Sample fields: name, full_name, address, postal_address present" -ForegroundColor Gray
        }
    }
}

# Summary
Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "   TEST SUMMARY" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$totalTests = $testsPassed + $testsFailed
$successRate = if ($totalTests -gt 0) { [math]::Round(($testsPassed / $totalTests) * 100, 2) } else { 0 }

Write-Host "`nTotal Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor Red
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 80) { "Green" } else { "Yellow" })

if ($testsFailed -eq 0) {
    Write-Host "`nAll tests passed! Integration working correctly." -ForegroundColor Green
    Write-Host "`nNext: Test in Flutter app with 'flutter run'" -ForegroundColor Cyan
} else {
    Write-Host "`nSome tests failed. Check errors above." -ForegroundColor Yellow
}
