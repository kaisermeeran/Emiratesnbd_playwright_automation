@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - setup check
%NODE% framework\selfcheck.js
pause
