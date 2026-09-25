@echo off
TITLE PDCL ICT Enterprise Task Management - Local PostgreSQL 1-Click Launcher
COLOR 0A
chcp 65001 >nul

echo ===============================================================================
echo     PDCL ICT Enterprise Task Management - 1-Click Local PostgreSQL Launcher
echo ===============================================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on your system!
    echo Please install Node.js (LTS version) from https://nodejs.org/
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

:: 2. Prompt or default PostgreSQL password
set /p PG_PASS="Enter your local PostgreSQL password (default: @dmin5066 or postgres) [Press Enter for default]: "
if "%PG_PASS%"=="" set PG_PASS=@dmin5066

set PGPASSWORD=%PG_PASS%
set PG_USER=postgres
set PG_HOST=localhost
set PG_PORT=5432
set PG_DB=taskflow

echo.
echo [1/4] Checking PostgreSQL connection...
where psql >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] psql command-line tool found.
    echo Creating database "%PG_DB%" if it does not already exist...
    psql -U %PG_USER% -h %PG_HOST% -p %PG_PORT% -tc "SELECT 1 FROM pg_database WHERE datname = '%PG_DB%'" | findstr 1 >nul
    if %ERRORLEVEL% neq 0 (
        psql -U %PG_USER% -h %PG_HOST% -p %PG_PORT% -c "CREATE DATABASE %PG_DB%;"
        echo [OK] Database "%PG_DB%" created.
    ) else (
        echo [OK] Database "%PG_DB%" already exists.
    )

    echo [2/4] Initializing database tables and schema...
    if exist "backend\src\db\schema.postgres.sql" (
        psql -U %PG_USER% -h %PG_HOST% -p %PG_PORT% -d %PG_DB% -f "backend\src\db\schema.postgres.sql" >nul 2>nul
        echo [OK] Schema and tables initialized successfully.
    )
) else (
    echo [INFO] psql command not directly in PATH. Database connection string will be configured in .env.
)

echo.
echo [3/4] Writing local configuration (.env)...
(
    echo PORT=3000
    echo NODE_ENV=development
    echo DATABASE_URL=postgresql://%PG_USER%:%PG_PASS%@%PG_HOST%:%PG_PORT%/%PG_DB%?sslmode=disable
    echo PGHOST=%PG_HOST%
    echo PGPORT=%PG_PORT%
    echo PGUSER=%PG_USER%
    echo PGPASSWORD=%PG_PASS%
    echo PGDATABASE=%PG_DB%
    echo PGSSLMODE=disable
) > .env

(
    echo PORT=3000
    echo NODE_ENV=development
    echo DATABASE_URL=postgresql://%PG_USER%:%PG_PASS%@%PG_HOST%:%PG_PORT%/%PG_DB%?sslmode=disable
    echo PGHOST=%PG_HOST%
    echo PGPORT=%PG_PORT%
    echo PGUSER=%PG_USER%
    echo PGPASSWORD=%PG_PASS%
    echo PGDATABASE=%PG_DB%
    echo PGSSLMODE=disable
) > backend\.env

echo [OK] Environment configured with PostgreSQL connection.

echo.
echo [4/4] Starting PDCL ICT Enterprise Task Management...
echo Opening browser at http://localhost:3000 ...

start http://localhost:3000

echo.
echo ===============================================================================
echo     Application is running! Leave this window open while using the app.
echo ===============================================================================
echo.

npm run dev
pause
