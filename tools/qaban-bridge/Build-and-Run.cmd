@echo off
setlocal
cd /d "%~dp0"
set "BRIDGE_CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%BRIDGE_CSC%" set "BRIDGE_CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%BRIDGE_CSC%" (
 echo Microsoft .NET Framework compiler was not found. Install .NET Framework 4.8 from Microsoft.
 pause
 exit /b 1
)
"%BRIDGE_CSC%" /nologo /codepage:65001 /target:exe /out:Bridge.Tests.exe /reference:System.Windows.Forms.dll /reference:System.Security.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll Bridge.cs Interface.cs ResponseRules.cs ApiTransport.cs OutputChannel.cs LocalSecrets.cs DualDeliveryTests.cs CompatibilityTests.cs
if errorlevel 1 goto failed
Bridge.Tests.exe --self-test
if errorlevel 1 goto failed
"%BRIDGE_CSC%" /nologo /codepage:65001 /target:winexe /win32icon:QabanAlGhad.ico /out:QabanAlGhad.exe /reference:System.Windows.Forms.dll /reference:System.Security.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll Bridge.cs Interface.cs ResponseRules.cs ApiTransport.cs OutputChannel.cs LocalSecrets.cs DualDeliveryTests.cs CompatibilityTests.cs
if errorlevel 1 goto failed
start "" QabanAlGhad.exe
exit /b 0
:failed
 echo Build or tests failed. Send a screenshot of this window.
 pause
 exit /b 1
