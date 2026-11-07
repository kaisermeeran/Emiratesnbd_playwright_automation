@echo off
cd /d "%~dp0"
set NODE="%~dp0node\node.exe"
title EximBill sanity - HTML report (close this window to stop)
%NODE% node_modules\@playwright\test\cli.js show-report results\html-report
