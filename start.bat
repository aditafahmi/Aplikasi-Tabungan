@echo off
title Aplikasi Tabungan
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang atau belum terdeteksi.
  echo Pasang dari https://nodejs.org lalu RESTART komputer / buka ulang jendela ini.
  pause
  exit /b 1
)
node server.js --open
pause
