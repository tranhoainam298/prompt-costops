@echo off
echo =========================================================================
echo  CostOps - Automated One-Click Bootstrap Launcher
echo =========================================================================
echo.
echo Launching services via Docker Compose...
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
echo.
echo =========================================================================
echo  CostOps is successfully launched!
echo  Access the local preview interface here:
echo  http://localhost:5173
echo =========================================================================
echo.
