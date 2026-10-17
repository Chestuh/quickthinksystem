<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = env('ADMIN_EMAIL');
        $password = env('ADMIN_PASSWORD');
        $name = env('ADMIN_NAME', 'QuickThink Administrator');

        if (! $email || ! $password || strlen($password) < 10) {
            throw new RuntimeException('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 10 characters before seeding.');
        }

        User::updateOrCreate(
            ['email' => mb_strtolower($email)],
            [
                'name' => $name,
                'password' => Hash::make($password),
                'role' => 'admin',
                'is_active' => true,
            ]
        );
    }
}
