@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - GTEE
%NODE% framework\test-launch.js GTEE
pause
