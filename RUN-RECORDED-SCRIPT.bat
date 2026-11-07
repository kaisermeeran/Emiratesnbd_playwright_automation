@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill - run a recorded test
echo Recorded tests:
dir /b tests\recorded\*.spec.js
echo.
set /p NAME=Name of the test to run (without .spec.js): 
%NODE% framework\recording.js run "tests\recorded\%NAME%.spec.js"
pause
