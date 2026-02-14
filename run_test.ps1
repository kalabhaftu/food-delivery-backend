# run_test.ps1

Write-Host "Starting Stress Test Support Script..."

# 1. Cleanup old containers
Write-Host "Cleaning up old containers..."
docker compose down --remove-orphans

# 2. Build and Start App
Write-Host "Building and starting app container..."
docker compose up -d --build app

# Wait for service to be healthy
Write-Host "Waiting for service to be ready (10s)..."
Start-Sleep -Seconds 10
# Ideally, check health endpoint, but sleep is simple for now

# 3. Check if container is running
$containerStatus = docker inspect -f '{{.State.Running}}' food-delivery-backend-app-1
if ($containerStatus -ne 'true') {
    Write-Error "Container failed to start."
    docker logs food-delivery-backend-app-1
    exit 1
}

# 4. Run k6
Write-Host "Running k6 stress test..."

$k6Success = $false
try {
    Write-Host "Attempting to run k6 via Docker Compose..."
    docker compose run --rm k6
    if ($LASTEXITCODE -eq 0) { $k6Success = $true }
} catch {
    Write-Warning "Docker Compose run failed. Trying local k6..."
    try {
        $env:TARGET_URL="http://localhost:3000"
        k6 run stress_test.js
        if ($LASTEXITCODE -eq 0) { $k6Success = $true }
    } catch {
        Write-Warning "Local k6 failed."
    }
}

if (-not $k6Success) {
    Write-Error "k6 test failed to execute or return success."
    # We don't exit here yet because we want to see if the app crashed
}

# 5. Monitor Exit Code
$exitCode = docker inspect -f '{{.State.ExitCode}}' food-delivery-backend-app-1
$oomKilled = docker inspect -f '{{.State.OOMKilled}}' food-delivery-backend-app-1

Write-Host "------------------------------------------------"
Write-Host "Test Completed."
Write-Host "Container Exit Code: $exitCode"
Write-Host "OOM Killed: $oomKilled"

if ($exitCode -eq 137 -or $oomKilled -eq 'true') {
    Write-Host "RESULT: FAILED - OOM DETECTED (Code 137)" -ForegroundColor Red
} else {
    Write-Host "RESULT: PASSED (No OOM detected during test)" -ForegroundColor Green
}
Write-Host "------------------------------------------------"

# Cleanup
# docker-compose down
