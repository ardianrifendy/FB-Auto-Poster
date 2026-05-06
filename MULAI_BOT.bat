@echo off
chcp 65001 > nul
title FB Auto Poster V2
color 0A
echo =========================================
echo Membuka Web Dashboard di browser Anda...
echo Biarkan jendela hitam ini tetap terbuka!
echo =========================================
start http://localhost:3000
node server.js
pause
