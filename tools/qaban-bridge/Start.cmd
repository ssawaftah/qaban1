@echo off
cd /d "%~dp0"
if not exist QabanAlGhad.exe (
 echo QabanAlGhad.exe was not found. Extract the entire ZIP first.
 pause
 exit /b 1
)
start "" QabanAlGhad.exe
