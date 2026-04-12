@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "LOCAL_NODE=%PROJECT_DIR%runtimes\node\node.exe"

:: ---- Check for local (portable) Node.js first, then system ----
if exist "%LOCAL_NODE%" (
    echo Using portable Node.js: %LOCAL_NODE%
    set "NODE_CMD=%LOCAL_NODE%"
) else (
    node --version >nul 2>&1
    if errorlevel 1 (
        echo X Node.js not found!
        echo   Run setup-runtimes.bat first to download portable runtimes,
        echo   or install Node.js from https://nodejs.org
        pause
        exit /b 1
    )
    echo Using system Node.js
    set "NODE_CMD=node"
)

:: ---- Check for local Java, then system ----
if exist "%PROJECT_DIR%runtimes\java\bin\java.exe" (
    echo Java: portable [runtimes\java]
) else (
    java -version >nul 2>&1 && (echo Java: system) || echo Warning: Java not found. Run setup-runtimes.bat or install Java.
)

:: ---- Check for local Python, then system ----
if exist "%PROJECT_DIR%runtimes\python\python.exe" (
    echo Python: portable [runtimes\python]
) else (
    python --version >nul 2>&1 && (echo Python: system) || echo Warning: Python not found. Run setup-runtimes.bat or install Python.
)

echo.
echo Starting Code Evaluator AI Agent...
echo Open browser: http://localhost:3000
echo.
"%NODE_CMD%" "%PROJECT_DIR%src\server.js"
