@echo off
setlocal
set SCRIPT_DIR=%~dp0
set PS1=%SCRIPT_DIR%install-windows.ps1

if not exist "%PS1%" (
  echo ERROR: install-windows.ps1 not found.
  echo Run this from the extracted folder.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo Install failed. See messages above.
)
pause
exit /b %EXIT_CODE%
