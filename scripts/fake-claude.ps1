# Fake Claude simulator for E2E tests (Windows PowerShell version)
# Automatically outputs Claude-like terminal activity to test status detection

Write-Host "FAKE_CLAUDE_READY"

Start-Sleep -Milliseconds 300

Write-Host ""
Write-Host "+---------------------------------------------+"
Write-Host "|  Claude is thinking...                      |"
Write-Host "+---------------------------------------------+"

# Simulate spinner
for ($i = 0; $i -lt 20; $i++) {
    Write-Host -NoNewline "`r. Analyzing request..."
    Start-Sleep -Milliseconds 100
}
Write-Host "`r* Analyzing request...  "

Start-Sleep -Milliseconds 200

for ($i = 0; $i -lt 10; $i++) {
    Write-Host -NoNewline "`r. Reading files..."
    Start-Sleep -Milliseconds 100
}
Write-Host "`r* Reading files...      "

Start-Sleep -Milliseconds 200

for ($i = 0; $i -lt 10; $i++) {
    Write-Host -NoNewline "`r. Generating response..."
    Start-Sleep -Milliseconds 100
}
Write-Host "`r* Generating response...  "

Write-Host ""
Write-Host "Done! This is a simulated Claude response."
Write-Host "View the PR at https://github.com/Broomy-AI/broomy/pull/149"
Write-Host ""

Write-Host "FAKE_CLAUDE_IDLE"

# Keep the script running but idle
Start-Sleep -Seconds 999999
