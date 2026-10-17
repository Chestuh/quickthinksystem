<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class DemoAccountsSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('local') || config('database.default') !== 'sqlite') {
            throw new RuntimeException('Demo accounts may only be seeded in a local SQLite environment.');
        }

        $accounts = [
            [
                'name' => 'QuickThink Test Admin',
                'email' => 'admin@quickthink.test',
                'password' => 'QuickThinkAdmin2026!',
                'role' => 'admin',
            ],
            [
                'name' => 'QuickThink Test Teacher',
                'email' => 'teacher@quickthink.test',
                'password' => 'QuickThinkTeacher2026!',
                'role' => 'teacher',
            ],
            [
                'name' => 'QuickThink Test Student',
                'email' => 'student@quickthink.test',
                'password' => 'QuickThinkStudent2026!',
                'role' => 'student',
            ],
        ];

        foreach ($accounts as $account) {
            User::updateOrCreate(
                ['email' => $account['email']],
                [
                    'name' => $account['name'],
                    'password' => Hash::make($account['password']),
                    'role' => $account['role'],
                    'is_active' => true,
                ]
            );
        }
    }
}
