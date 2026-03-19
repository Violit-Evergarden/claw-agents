@echo off
echo ===================================
echo   Claw Agents - Start System
echo ===================================
echo.

REM Check if config.json has API key set
findstr /C:"YOUR_API_KEY_HERE" D:\MyFiles\project\claw-agents\config.json >nul 2>&1
if %errorlevel% equ 0 (
  echo [WARNING] config.json still has placeholder API Key!
  echo Please edit D:\MyFiles\project\claw-agents\config.json and set your LLM API Key.
  echo.
  pause
)

cd /d D:\MyFiles\project\claw-agents
node src/main.js
