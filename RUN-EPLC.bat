@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - EPLC
%NODE% framework\test-launch.js EPLC
pause
