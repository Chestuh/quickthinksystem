<?php

namespace Tests\Feature;

use App\Models\SignInActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_registration_creates_a_student_and_returns_a_bearer_token(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'New Student',
            'email' => 'new@example.test',
            'password' => 'a-long-test-password',
            'password_confirmation' => 'a-long-test-password',
            'role' => 'admin',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.role', 'student')
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'email', 'role']]);
        $this->assertDatabaseHas('users', ['email' => 'new@example.test', 'role' => 'student']);
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/exams')->assertUnauthorized();
    }

    public function test_successful_login_is_recorded_and_visible_to_admins(): void
    {
        $student = User::create([
            'name' => 'Student Example',
            'email' => 'student@example.test',
            'password' => Hash::make('student-test-password'),
            'role' => 'student',
        ]);
        $admin = User::create([
            'name' => 'Admin Example',
            'email' => 'admin@example.test',
            'password' => Hash::make('admin-test-password'),
            'role' => 'admin',
        ]);

        $this->postJson('/api/login', [
            'email' => $student->email,
            'password' => 'student-test-password',
        ])->assertOk();

        $this->assertDatabaseHas('sign_in_activity', [
            'user_id' => $student->id,
            'user_email' => $student->email,
            'user_role' => 'student',
        ]);
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/sign-in-activity')
            ->assertOk()
            ->assertJsonFragment([
                'userId' => (string) $student->id,
                'name' => $student->name,
                'email' => $student->email,
                'role' => 'student',
            ]);
    }

    public function test_failed_login_does_not_create_sign_in_activity(): void
    {
        User::create([
            'name' => 'Student Example',
            'email' => 'student@example.test',
            'password' => Hash::make('student-test-password'),
            'role' => 'student',
        ]);

        $this->postJson('/api/login', [
            'email' => 'student@example.test',
            'password' => 'incorrect-password',
        ])->assertUnprocessable();

        $this->assertSame(0, SignInActivity::count());
    }

    public function test_non_admin_users_cannot_read_sign_in_activity(): void
    {
        $teacher = User::create([
            'name' => 'Teacher Example',
            'email' => 'teacher@example.test',
            'password' => Hash::make('teacher-test-password'),
            'role' => 'teacher',
        ]);

        $this->actingAs($teacher, 'sanctum')
            ->getJson('/api/sign-in-activity')
            ->assertForbidden();
    }
}
