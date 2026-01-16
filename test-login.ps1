# Test Login API Endpoint

Write-Host "Testing NF Farming Login API..." -ForegroundColor Green
Write-Host ""

# Test 1: Field Visitor Login
Write-Host "Test 1: Field Visitor Login (FV001)" -ForegroundColor Cyan
$fieldBody = @{
    username = "FV001"
    password = "password123"
    role = "field"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' `
        -Method POST `
        -Body $fieldBody `
        -ContentType 'application/json'
    
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "✗ Failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 2: Manager Login
Write-Host "Test 2: Manager Login (admin@nf.com)" -ForegroundColor Cyan
$managerBody = @{
    username = "admin@nf.com"
    password = "password123"
    role = "manager"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' `
        -Method POST `
        -Body $managerBody `
        -ContentType 'application/json'
    
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "✗ Failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "Test completed!" -ForegroundColor Green
