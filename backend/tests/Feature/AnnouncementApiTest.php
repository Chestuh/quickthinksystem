<?php

namespace Tests\Feature;

use App\Models\Announcement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnnouncementApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_publish_announcements_visible_to_authenticated_users(): void
    {
        $admin = User::create([
            'name' => 'Administrator',
            'email' => 'admin@example.test',
            'password' => 'not-a-real-password',
            'role' => 'admin',
        ]);
        $student = User::create([
            'name' => 'Student',
            'email' => 'student@example.test',
            'password' => 'not-a-real-password',
            'role' => 'student',
        ]);

        $response = $this->withToken($admin->createToken('admin-test')->plainTextToken)
            ->postJson('/api/announcements', [
                'title' => 'Exam schedule update',
                'body' => 'The exam will begin at 9:00 AM.',
            ]);

        $response->assertCreated()
            ->assertJsonPath('title', 'Exam schedule update')
            ->assertJsonPath('authorName', 'Administrator');
        $this->assertDatabaseHas('announcements', ['title' => 'Exam schedule update']);

        $this->withToken($student->createToken('student-test')->plainTextToken)
            ->getJson('/api/announcements')
            ->assertOk()
            ->assertJsonPath('0.title', 'Exam schedule update')
            ->assertJsonPath('0.body', 'The exam will begin at 9:00 AM.');

        $this->withToken($admin->createToken('admin-delete-test')->plainTextToken)
            ->deleteJson('/api/announcements/'.$response->json('id'))
            ->assertOk();
        $this->assertDatabaseMissing('announcements', ['title' => 'Exam schedule update']);
    }

    public function test_non_admin_cannot_publish_or_delete_announcements(): void
    {
        $teacher = User::create([
            'name' => 'Teacher',
            'email' => 'teacher@example.test',
            'password' => 'not-a-real-password',
            'role' => 'teacher',
        ]);
        $announcement = Announcement::create([
            'title' => 'Existing post',
            'body' => 'Only administrators can remove this.',
        ]);
        $token = $teacher->createToken('teacher-test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/announcements', [
                'title' => 'Unauthorized post',
                'body' => 'This should not be allowed.',
            ])
            ->assertForbidden();
        $this->withToken($token)
            ->deleteJson("/api/announcements/{$announcement->id}")
            ->assertForbidden();
        $this->assertDatabaseCount('announcements', 1);
    }
}
