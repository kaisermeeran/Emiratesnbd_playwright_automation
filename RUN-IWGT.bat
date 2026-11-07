@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - IWGT
%NODE% framework\test-launch.js IWGT
pause
