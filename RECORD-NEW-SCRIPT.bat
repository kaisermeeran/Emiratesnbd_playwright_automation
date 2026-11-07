@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill - record a new test
set /p NAME=Name for the new test (no spaces, e.g. EPLC_advise): 
for /f "delims=" %%u in ('%NODE% framework\print-url.js') do set URL=%%u
echo.
echo A browser and a Playwright Inspector window will open on %URL%
echo Do the steps in the browser. Close the browser when you are finished.
echo.
%NODE% node_modules\playwright\cli.js codegen --channel=msedge --target=playwright-test --output "tests\recorded\%NAME%.spec.js" %URL%
if exist "tests\recorded\%NAME%.spec.js" (
  %NODE% framework\recording.js clean "tests\recorded\%NAME%.spec.js"
  echo Saved as tests\recorded\%NAME%.spec.js
) else (
  echo Nothing was saved.
)
pause
