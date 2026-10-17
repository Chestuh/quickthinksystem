<?php

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require_once __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (config('database.default') !== 'pgsql') {
    throw new RuntimeException('The Vercel backend requires PostgreSQL.');
}

if (! config('database.connections.pgsql_unpooled.url')) {
    throw new RuntimeException('DATABASE_URL_UNPOOLED is required for safe database setup.');
}

config(['database.default' => 'pgsql_unpooled']);

$connection = DB::connection();
$lockId = 2026101701;
$locked = false;

try {
    $connection->selectOne('SELECT pg_advisory_lock(?)', [$lockId]);
    $locked = true;

    $status = Artisan::call('migrate', ['--force' => true]);
    fwrite(STDOUT, Artisan::output());

    if ($status !== 0) {
        throw new RuntimeException("Database migrations failed with exit code {$status}.");
    }

    $missingTables = array_filter(['users', 'cache', 'cache_locks'], fn (string $table): bool => ! Schema::hasTable($table));
    if ($missingTables !== []) {
        throw new RuntimeException('Database migrations completed without required tables: '.implode(', ', $missingTables).'.');
    }

    fwrite(STDOUT, "Database migrations completed and required tables are available.\n");

    if (env('ADMIN_EMAIL') && env('ADMIN_PASSWORD') && ! User::where('role', 'admin')->exists()) {
        $status = Artisan::call('db:seed', [
            '--class' => Database\Seeders\AdminUserSeeder::class,
            '--force' => true,
        ]);
        fwrite(STDOUT, Artisan::output());

        if ($status !== 0) {
            throw new RuntimeException("Initial administrator setup failed with exit code {$status}.");
        }
    }
} finally {
    if ($locked) {
        $connection->selectOne('SELECT pg_advisory_unlock(?)', [$lockId]);
    }
}
