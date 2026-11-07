@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - check an existing transaction
set /p MOD=Module code (IPLC, EPLC, IMCO, EXCO, GTEE, IWGT): 
set /p REF=Transaction reference (e.g. ENBDLC26007798): 
%NODE% framework\test-launch.js %MOD%=%REF%
pause
