# ============================================
# FLUTTER FIREWALL FIX - RUN AS ADMINISTRATOR
# ============================================

# Your Flutter SDK location: C:\Users\USER\Downloads\flutter

# Step 1: Allow Flutter.exe (Inbound)
New-NetFirewallRule -DisplayName "Flutter DevTools" -Direction Inbound -Program "C:\Users\USER\Downloads\flutter\bin\flutter.exe" -Action Allow -Profile Any

# Step 2: Allow Dart VM (Inbound)
New-NetFirewallRule -DisplayName "Dart VM Service" -Direction Inbound -Program "C:\Users\USER\Downloads\flutter\bin\cache\dart-sdk\bin\dart.exe" -Action Allow -Profile Any

# Step 3: Allow Flutter.exe (Outbound)
New-NetFirewallRule -DisplayName "Flutter DevTools Outbound" -Direction Outbound -Program "C:\Users\USER\Downloads\flutter\bin\flutter.exe" -Action Allow -Profile Any

# Step 4: Allow Dart VM (Outbound)
New-NetFirewallRule -DisplayName "Dart VM Outbound" -Direction Outbound -Program "C:\Users\USER\Downloads\flutter\bin\cache\dart-sdk\bin\dart.exe" -Action Allow -Profile Any

Write-Host ""
Write-Host "✅ Firewall rules added successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Close this PowerShell window"
Write-Host "2. Go back to your terminal"
Write-Host "3. Run: flutter run --no-enable-impeller"
Write-Host ""
