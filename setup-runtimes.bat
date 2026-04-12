@echo off
setlocal enabledelayedexpansion

:: ====================================================================
:: PORTABLE RUNTIME SETUP — Downloads Node.js, JDK, Python into runtimes/
:: Run this ONCE after cloning/copying the project to a new machine.
:: After setup, use start.bat to launch the server.
:: ====================================================================

set "PROJECT_DIR=%~dp0"
set "RUNTIMES_DIR=%PROJECT_DIR%runtimes"
set "DOWNLOADS_DIR=%RUNTIMES_DIR%\downloads"

:: ---- Version Configuration ----
set "NODE_VERSION=20.18.1"
set "JDK_VERSION=21.0.2"
set "JDK_BUILD=13"
set "PYTHON_VERSION=3.12.8"

echo.
echo ============================================
echo   Portable Runtime Setup
echo ============================================
echo   Project: %PROJECT_DIR%
echo   Runtimes: %RUNTIMES_DIR%
echo ============================================
echo.

:: Create directories
if not exist "%RUNTIMES_DIR%" mkdir "%RUNTIMES_DIR%"
if not exist "%DOWNLOADS_DIR%" mkdir "%DOWNLOADS_DIR%"

:: ==================== NODE.JS ====================
echo.
echo [1/4] Setting up Node.js v%NODE_VERSION%...

set "NODE_DIR=%RUNTIMES_DIR%\node"
if exist "%NODE_DIR%\node.exe" (
    echo   ✓ Node.js already installed, skipping download.
    goto :skip_node
)

set "NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP%"
set "NODE_DOWNLOAD=%DOWNLOADS_DIR%\%NODE_ZIP%"

if not exist "%NODE_DOWNLOAD%" (
    echo   Downloading Node.js from %NODE_URL%...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_DOWNLOAD%'" 2>nul
    if errorlevel 1 (
        echo   ✗ Failed to download Node.js. Please download manually:
        echo     URL: %NODE_URL%
        echo     Save to: %NODE_DOWNLOAD%
        goto :skip_node
    )
)

echo   Extracting Node.js...
powershell -Command "Expand-Archive -Path '%NODE_DOWNLOAD%' -DestinationPath '%RUNTIMES_DIR%' -Force" 2>nul
if exist "%RUNTIMES_DIR%\node-v%NODE_VERSION%-win-x64" (
    if exist "%NODE_DIR%" rmdir /s /q "%NODE_DIR%"
    rename "%RUNTIMES_DIR%\node-v%NODE_VERSION%-win-x64" "node"
)

if exist "%NODE_DIR%\node.exe" (
    echo   ✓ Node.js v%NODE_VERSION% installed successfully.
) else (
    echo   ✗ Node.js extraction failed.
)
:skip_node

:: ==================== JAVA (OpenJDK) ====================
echo.
echo [2/4] Setting up OpenJDK %JDK_VERSION%...

set "JAVA_DIR=%RUNTIMES_DIR%\java"
if exist "%JAVA_DIR%\bin\java.exe" (
    echo   ✓ Java already installed, skipping download.
    goto :skip_java
)

set "JDK_ZIP=openjdk-%JDK_VERSION%_windows-x64_bin.zip"
set "JDK_URL=https://download.java.net/java/GA/jdk%JDK_VERSION%/%JDK_BUILD%/GPL/%JDK_ZIP%"
set "JDK_DOWNLOAD=%DOWNLOADS_DIR%\%JDK_ZIP%"

if not exist "%JDK_DOWNLOAD%" (
    echo   Downloading OpenJDK from %JDK_URL%...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%JDK_URL%' -OutFile '%JDK_DOWNLOAD%'" 2>nul
    if errorlevel 1 (
        echo   ✗ Failed to download JDK. Trying Adoptium (Eclipse Temurin)...
        set "JDK_URL2=https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!JDK_URL2!' -OutFile '%JDK_DOWNLOAD%'" 2>nul
        if errorlevel 1 (
            echo   ✗ Failed to download JDK from both sources. Please download manually.
            goto :skip_java
        )
    )
)

echo   Extracting OpenJDK...
powershell -Command "Expand-Archive -Path '%JDK_DOWNLOAD%' -DestinationPath '%RUNTIMES_DIR%' -Force" 2>nul

:: Find the extracted JDK folder (name varies by version)
for /d %%D in ("%RUNTIMES_DIR%\jdk-*") do (
    if exist "%JAVA_DIR%" rmdir /s /q "%JAVA_DIR%"
    rename "%%D" "java"
)

if exist "%JAVA_DIR%\bin\java.exe" (
    echo   ✓ OpenJDK %JDK_VERSION% installed successfully.
) else (
    echo   ✗ JDK extraction failed. Check %RUNTIMES_DIR% for extracted folder.
)
:skip_java

:: ==================== PYTHON (Embeddable) ====================
echo.
echo [3/4] Setting up Python %PYTHON_VERSION%...

set "PYTHON_DIR=%RUNTIMES_DIR%\python"
if exist "%PYTHON_DIR%\python.exe" (
    echo   ✓ Python already installed, skipping download.
    goto :skip_python
)

set "PYTHON_ZIP=python-%PYTHON_VERSION%-embed-amd64.zip"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/%PYTHON_ZIP%"
set "PYTHON_DOWNLOAD=%DOWNLOADS_DIR%\%PYTHON_ZIP%"

if not exist "%PYTHON_DOWNLOAD%" (
    echo   Downloading Python from %PYTHON_URL%...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_DOWNLOAD%'" 2>nul
    if errorlevel 1 (
        echo   ✗ Failed to download Python. Please download manually:
        echo     URL: %PYTHON_URL%
        echo     Save to: %PYTHON_DOWNLOAD%
        goto :skip_python
    )
)

echo   Extracting Python...
if exist "%PYTHON_DIR%" rmdir /s /q "%PYTHON_DIR%"
mkdir "%PYTHON_DIR%"
powershell -Command "Expand-Archive -Path '%PYTHON_DOWNLOAD%' -DestinationPath '%PYTHON_DIR%' -Force" 2>nul

if exist "%PYTHON_DIR%\python.exe" (
    echo   ✓ Python %PYTHON_VERSION% installed successfully.
) else (
    echo   ✗ Python extraction failed.
)
:skip_python

:: ==================== DOWNLOAD CODEMIRROR ====================
echo.
echo [4/4] Setting up CodeMirror (offline editor library)...

set "LIB_DIR=%PROJECT_DIR%public\lib\codemirror"
if exist "%LIB_DIR%\codemirror.min.js" (
    echo   ✓ CodeMirror already downloaded, skipping.
    goto :skip_codemirror
)

if not exist "%LIB_DIR%" mkdir "%LIB_DIR%"
if not exist "%LIB_DIR%\mode" mkdir "%LIB_DIR%\mode"
if not exist "%LIB_DIR%\addon" mkdir "%LIB_DIR%\addon"

set "CM_BASE=https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2"

echo   Downloading CodeMirror core...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/codemirror.min.js' -OutFile '%LIB_DIR%\codemirror.min.js'" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/codemirror.min.css' -OutFile '%LIB_DIR%\codemirror.min.css'" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/theme/material.min.css' -OutFile '%LIB_DIR%\material.min.css'" 2>nul

echo   Downloading CodeMirror modes and addons...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/mode/clike/clike.min.js' -OutFile '%LIB_DIR%\mode\clike.min.js'" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/mode/python/python.min.js' -OutFile '%LIB_DIR%\mode\python.min.js'" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/addon/edit/closebrackets.min.js' -OutFile '%LIB_DIR%\addon\closebrackets.min.js'" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/addon/edit/matchbrackets.min.js' -OutFile '%LIB_DIR%\addon\matchbrackets.min.js'" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%CM_BASE%/addon/comment/comment.min.js' -OutFile '%LIB_DIR%\addon\comment.min.js'" 2>nul

if exist "%LIB_DIR%\codemirror.min.js" (
    echo   ✓ CodeMirror downloaded successfully.
) else (
    echo   ✗ CodeMirror download failed. The app will fall back to CDN.
)
:skip_codemirror

:: ==================== CLEANUP DOWNLOADS ====================
echo.
echo Cleaning up download cache...
if exist "%DOWNLOADS_DIR%" rmdir /s /q "%DOWNLOADS_DIR%"
echo   ✓ Cleaned up.

:: ==================== SUMMARY ====================
echo.
echo ============================================
echo   Setup Complete! Runtime Status:
echo ============================================

if exist "%NODE_DIR%\node.exe" (
    echo   ✓ Node.js  : %NODE_DIR%\node.exe
) else (
    echo   ✗ Node.js  : NOT INSTALLED
)

if exist "%JAVA_DIR%\bin\java.exe" (
    echo   ✓ Java     : %JAVA_DIR%\bin\java.exe
) else (
    echo   ✗ Java     : NOT INSTALLED
)

if exist "%PYTHON_DIR%\python.exe" (
    echo   ✓ Python   : %PYTHON_DIR%\python.exe
) else (
    echo   ✗ Python   : NOT INSTALLED
)

if exist "%LIB_DIR%\codemirror.min.js" (
    echo   ✓ CodeMirror: %LIB_DIR%
) else (
    echo   ✗ CodeMirror: NOT DOWNLOADED (will use CDN)
)

echo.
echo ============================================
echo   Next step: Run start.bat to launch the server
echo ============================================
echo.
pause
