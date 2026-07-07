@echo off
title BUZZER Server
cd /d "%~dp0"

if not exist server\node_modules (
  echo Erste Einrichtung: Abhaengigkeiten werden installiert ...
  pushd server
  call npm install --no-audit --no-fund
  popd
)

echo.
echo Oeffentlicher Link erscheint gleich im zweiten Fenster
echo (Zeile mit https://....trycloudflare.com)
echo.
start "BUZZER-Tunnel" "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:8787 --no-autoupdate

echo BUZZER-Server laeuft. Dieses Fenster offen lassen. Beenden: Strg+C
node server\server.js
