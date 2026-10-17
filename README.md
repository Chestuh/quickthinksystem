# QuickThink

QuickThink is an examination portal with a React frontend and a Laravel API. The local setup uses SQLite to save accounts, exams, questions, announcements, and exam results.

## Run it on Windows

### One-time setup

Install:

- PHP 8.3 and the `curl`, `fileinfo`, `mbstring`, `openssl`, `pdo_sqlite`, `sqlite3`, and `zip` extensions
- Composer 2
- Node.js LTS and npm

If PHP is not installed, use PowerShell:

```powershell
winget install --source winget --id PHP.PHP.8.3 --exact
```

Install Composer with the official [Windows installer](https://getcomposer.org/Composer-Setup.exe). Close and reopen VS Code after installation so the terminal can find PHP and Composer.

From the QuickThink project folder, install the app dependencies once:

```powershell
Set-Location "C:\Users\chizu\OneDrive\Desktop\QuickThink"
Set-Location .\backend
composer install
Set-Location ..
npm.cmd install
```

### Start QuickThink

Open PowerShell in the project folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-quickthink.ps1
```

The launcher prepares the local SQLite database, runs pending migrations, creates or refreshes the local test accounts, starts the Laravel API and React frontend, and opens the site. It does **not** erase your database.

Open the app at **http://localhost:5173**. The API runs at **http://127.0.0.1:8001**. Leave both server terminal windows open while using QuickThink; press **Ctrl+C** in a server window to stop it.

### Deploy the full app to Vercel

The root `vercel.json` deploys the React frontend and Laravel API as separate Vercel services. `/api/*` and `/up` go to the Laravel container; other paths go to the frontend, where a service-level SPA rewrite serves `index.html` for client-side routes such as `/register` and `/login`. The frontend uses the same-origin `/api` path in production, so it does not need a localhost URL or a separate CORS origin.

Vercel's container filesystem is temporary, so production must use a persistent PostgreSQL database; do not use the checked-in SQLite database for live data. Add these environment variables to the Vercel project for **Production**, **Preview**, and **Development** as appropriate:

| Variable | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | Generate with `php artisan key:generate --show` from `backend/`; keep the generated key private |
| `APP_URL` | The deployed app's HTTPS URL |
| `DB_CONNECTION` | `pgsql` |
| `DATABASE_URL` | Neon pooled Postgres connection string, provided by the Vercel Marketplace integration |
| `DATABASE_URL_UNPOOLED` | Neon direct Postgres connection string, provided by the Vercel Marketplace integration; used only to coordinate startup migrations |
| `DB_CACHE_CONNECTION` | Optional override; defaults to `pgsql_unpooled` when `DATABASE_URL_UNPOOLED` is configured |
| `CACHE_STORE` | `database` |
| `SESSION_DRIVER` | `array` |
| `LOG_CHANNEL` | `stderr` |

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 10 characters), and optionally `ADMIN_NAME` as private environment variables before the first deployment. The container runs pending migrations over the direct, unpooled PostgreSQL connection while holding an advisory lock before starting Apache. This ensures multiple Vercel instances cannot race while initializing the schema and avoids running DDL through Neon's transaction pooler. When `DATABASE_URL_UNPOOLED` is present, Laravel's database-backed rate limiter also uses the direct connection because cache increments rely on row-locked transactions; ordinary application queries remain pooled. You can override this with `DB_CACHE_CONNECTION`. Startup verifies the user and cache tables exist before serving requests. If there is no administrator yet and those variables are set, it creates the initial administrator once; restarts do not reset an existing administrator's password. Remove `ADMIN_PASSWORD` from Vercel after initial setup if you do not want it available for future fresh database branches. Do not use the public demo credentials on a live deployment.

Install the Neon Postgres integration from the Vercel Marketplace and connect it to this project for Production and Preview; it provisions `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. A separate Neon branch is enabled for Preview deployments so they do not write to production data. Redeploy after connecting the integration and setting the administrator variables. Never run the demo-account seeder against production.

Push the changes and redeploy the Vercel project. Confirm the API is reachable at `https://<your-domain>/up`. Do not set `VITE_API_URL` on Vercel unless the API is intentionally hosted at a different URL; if it is, set it to that API's full `/api` URL and redeploy because Vite embeds it at build time.

## Ready-to-use local test accounts

The startup script seeds these accounts into the local SQLite database:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@quickthink.test` | `QuickThinkAdmin2026!` |
| Teacher | `teacher@quickthink.test` | `QuickThinkTeacher2026!` |
| Student | `student@quickthink.test` | `QuickThinkStudent2026!` |

Use them on the Login page to check each role. The admin can create exams and announcements and manage accounts. The student can take published exams and see their own results. Public registration also creates student accounts.

**These are public, development-only test credentials. Never use them on a live deployment.** The demo seeder refuses to run unless `APP_ENV=local` and `DB_CONNECTION=sqlite`. It resets these three demo accounts' passwords each time the startup script runs; it does not change your other users.

### Try a complete exam

1. Sign in as the **Administrator** using the test account above.
2. Open **Exams**. Enter an exam title and subject, choose a duration of at least 10 minutes, and set the date to today.
3. Add a question, fill in its options, select the correct answer, set the status to **Published**, and save.
4. Log out and sign in as the **Student**. Open **Exams**, start the published test, answer it, and submit. The score is calculated by the server and appears under **Results**.
5. Sign in as the **Administrator** again to publish an announcement from **Announcements** or manage accounts under **Users**.

Each student can submit an exam only once. Register another student account if you need to repeat the same exam test.

## Start the servers manually (optional)

Use these commands after the one-time setup above has initialized `backend\.env` and the database. Open two PowerShell terminals.

**Terminal 1 — backend:**

```powershell
Set-Location "C:\Users\chizu\OneDrive\Desktop\QuickThink\backend"
php artisan serve --host 127.0.0.1 --port 8001
```

**Terminal 2 — frontend:**

```powershell
Set-Location "C:\Users\chizu\OneDrive\Desktop\QuickThink"
npm.cmd run dev
```

To refresh the demo logins without starting the launcher, seed them from the backend folder:

```powershell
php artisan db:seed --class=DemoAccountsSeeder
```

To create your own administrator account, set `ADMIN_EMAIL` and a private `ADMIN_PASSWORD` (at least 10 characters) in `backend\.env`, then run `php artisan db:seed --class=AdminUserSeeder`.

## Troubleshooting

- **`php` or `composer` is not recognized:** close and reopen the VS Code terminal after installing them. Check with `php -v` and `composer --version`.
- **Port 8001 or 5173 is already in use:** stop the old QuickThink server window with **Ctrl+C**, then run the startup script again. It will not stop an unrelated process using either port.
- **The site opens but cannot reach the API:** make sure both servers are running and that `VITE_API_URL` in the project `.env.local` is `http://127.0.0.1:8001/api`. Restart Vite after changing it.
- **A login does not work:** use the exact test email and password above. The launcher re-seeds the demo accounts the next time it runs.
- **A migration fails:** check that PHP's `pdo_sqlite` extension is enabled with `php -m`, then run the launcher again.

## What is included

- Role-based administrator, teacher, and student accounts
- Exam creation and management with multiple-choice questions
- Text-based PDF and `.docx` question import in the browser
- Timed student attempts, saved answers, and server-side grading
- Student and staff results views
- Announcements that administrators can publish and remove
- Login history for administrators, with a welcome notice after sign-in and periodic admin alerts for new account sign-ins
- SQLite for local use; MySQL can be configured for deployment

Correct answers are not sent to student accounts. Exam dates use `APP_TIMEZONE` (default `Asia/Manila`). The document importer does not perform OCR on scanned PDFs. Firebase/Firestore is not connected.

## Tests and production notes

Run backend tests:

```powershell
Set-Location .\backend
composer test
```

Run frontend checks from the project folder:

```powershell
Set-Location ..
npm.cmd run lint
npm.cmd run build
```

For a real deployment, use HTTPS, a production database such as MySQL, strong private credentials, `APP_ENV=production`, and `APP_DEBUG=false`. Do not run the demo-account seeder or publish its test credentials on a production server.
