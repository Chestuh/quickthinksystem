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

### Deploy the frontend to Vercel

The root `vercel.json` rewrites frontend routes such as `/login` and `/register` to the React app entry page. Commit and push that file, then redeploy the Vercel project so direct links and page refreshes work.

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
