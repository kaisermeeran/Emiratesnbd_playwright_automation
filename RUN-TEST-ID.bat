@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - one test case
set /p TID=Test ID from data\testdata.xlsx (e.g. IPLC-02): 
%NODE% framework\test-launch.js %TID%
pause
