@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - ALL modules
%NODE% framework\test-launch.js ALL
pause
