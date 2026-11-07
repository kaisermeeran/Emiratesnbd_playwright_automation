@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - IPLC
%NODE% framework\test-launch.js IPLC
pause
