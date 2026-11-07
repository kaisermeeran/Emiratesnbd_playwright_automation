@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - EXCO
%NODE% framework\test-launch.js EXCO
pause
