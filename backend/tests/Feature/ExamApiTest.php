<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExamApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_can_submit_once_and_receives_server_graded_result(): void
    {
        $teacher = User::create([
            'name' => 'Teacher',
            'email' => 'teacher@example.test',
            'password' => 'not-a-real-password',
            'role' => 'teacher',
        ]);
        $student = User::create([
            'name' => 'Student',
            'email' => 'student@example.test',
            'password' => 'not-a-real-password',
            'role' => 'student',
        ]);
        $exam = Exam::create([
            'created_by' => $teacher->id,
            'title' => 'Algebra',
            'subject' => 'Mathematics',
            'duration_minutes' => 30,
            'status' => 'Published',
        ]);
        $question = $exam->questions()->create([
            'position' => 1,
            'text' => 'What is 2 + 2?',
            'options' => ['3', '4'],
            'answer' => '4',
            'points' => 2,
        ]);

        $token = $student->createToken('test')->plainTextToken;
        $this->withToken($token)->postJson("/api/exams/{$exam->id}/start")->assertOk();
        $response = $this->withToken($token)->postJson("/api/exams/{$exam->id}/submit", [
            'answers' => [(string) $question->id => '4'],
        ]);

        $response->assertCreated()->assertJsonPath('score', 2)->assertJsonPath('maxScore', 2)->assertJsonPath('percentage', 100);
        $this->assertDatabaseHas('attempts', ['exam_id' => $exam->id, 'user_id' => $student->id]);

        $this->withToken($token)->postJson("/api/exams/{$exam->id}/submit", [
            'answers' => [(string) $question->id => '3'],
        ])->assertStatus(409);
    }

    public function test_student_exam_listing_never_discloses_answer_key(): void
    {
        $teacher = User::create([
            'name' => 'Teacher',
            'email' => 'teacher@example.test',
            'password' => 'not-a-real-password',
            'role' => 'teacher',
        ]);
        $student = User::create([
            'name' => 'Student',
            'email' => 'student@example.test',
            'password' => 'not-a-real-password',
            'role' => 'student',
        ]);
        $exam = Exam::create([
            'created_by' => $teacher->id,
            'title' => 'Quiz',
            'subject' => 'Science',
            'duration_minutes' => 20,
            'status' => 'Published',
        ]);
        $exam->questions()->create([
            'position' => 1,
            'text' => 'Correct option?',
            'options' => ['A', 'B'],
            'answer' => 'B',
        ]);

        $this->withToken($student->createToken('test')->plainTextToken)
            ->getJson('/api/exams')
            ->assertOk()
            ->assertJsonMissingPath('0.questions.0.answer')
            ->assertJsonPath('0.questions.0.options.1', 'B');
    }

    public function test_student_can_start_an_exam_scheduled_for_today(): void
    {
        $teacher = User::create([
            'name' => 'Teacher',
            'email' => 'teacher-today@example.test',
            'password' => 'not-a-real-password',
            'role' => 'teacher',
        ]);
        $student = User::create([
            'name' => 'Student',
            'email' => 'student-today@example.test',
            'password' => 'not-a-real-password',
            'role' => 'student',
        ]);
        $exam = Exam::create([
            'created_by' => $teacher->id,
            'title' => 'Today exam',
            'subject' => 'Science',
            'duration_minutes' => 20,
            'scheduled_for' => now()->toDateString(),
            'status' => 'Published',
        ]);
        $exam->questions()->create([
            'position' => 1,
            'text' => 'Can this exam be started today?',
            'options' => ['Yes', 'No'],
            'answer' => 'Yes',
        ]);

        $this->withToken($student->createToken('test')->plainTextToken)
            ->postJson("/api/exams/{$exam->id}/start")
            ->assertOk()
            ->assertJsonStructure(['id', 'expiresAt', 'answers']);
    }
}
