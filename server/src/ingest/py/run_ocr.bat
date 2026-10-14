@echo off
rem Starts the 10 OCR shards (see ocr.py). Safe to rerun: finished pages are skipped.
cd /d D:\arohon_ai\server\src\ingest\py
if not exist "%TEMP%\claude\ocrlogs" mkdir "%TEMP%\claude\ocrlogs"
for /L %%i in (0,1,9) do start "" /b /low cmd /c "python ocr.py all %%i/10 >> "%TEMP%\claude\ocrlogs\w%%i.log" 2>&1"
