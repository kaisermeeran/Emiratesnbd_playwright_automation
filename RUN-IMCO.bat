@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - IMCO
%NODE% framework\test-launch.js IMCO
pause
