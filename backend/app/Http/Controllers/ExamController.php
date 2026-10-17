<?php

namespace App\Http\Controllers;

use App\Models\Attempt;
use App\Models\Exam;
use App\Models\User;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExamController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Exam::with('questions')->latest();
        if ($request->user()->role === 'student') {
            $query->where('status', 'Published')
                ->whereDoesntHave('attempts', fn ($attemptQuery) => $attemptQuery
                    ->where('user_id', $request->user()->id)
                    ->whereNotNull('submitted_at'));
        } elseif ($request->user()->role === 'teacher') {
            $query->where('created_by', $request->user()->id);
        }

        return response()->json($query->get()->map(
            fn (Exam $exam): array => $this->examPayload($exam, $request->user()->role !== 'student')
        ));
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $this->validateExam($request);
        $exam = $this->transactionWithRecovery(function () use ($request, $payload): Exam {
            $exam = Exam::create([
                'created_by' => $request->user()->id,
                'title' => $payload['title'],
                'subject' => $payload['subject'],
                'duration_minutes' => $payload['durationMinutes'],
                'scheduled_for' => $payload['date'] ?? null,
                'status' => $payload['status'],
            ]);
            $this->replaceQuestions($exam, $payload['questions']);

            return $exam->load('questions');
        });

        return response()->json($this->examPayload($exam, true), 201);
    }

    public function show(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeExam($request->user(), $exam);
        if ($request->user()->role === 'student' && $exam->status !== 'Published') {
            abort(404);
        }

        return response()->json($this->examPayload(
            $exam->load('questions'),
            $request->user()->role !== 'student'
        ));
    }

    public function update(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeExam($request->user(), $exam);
        $payload = $this->validateExam($request, true);

        $this->transactionWithRecovery(function () use ($exam, $payload): void {
            $attributes = [];
            foreach ([
                'title' => 'title',
                'subject' => 'subject',
                'durationMinutes' => 'duration_minutes',
                'date' => 'scheduled_for',
                'status' => 'status',
            ] as $input => $column) {
                if (array_key_exists($input, $payload)) {
                    $attributes[$column] = $payload[$input];
                }
            }
            $exam->fill($attributes)->save();

            if (array_key_exists('questions', $payload)) {
                $exam->questions()->delete();
                $this->replaceQuestions($exam, $payload['questions']);
            }
        });

        return response()->json($this->examPayload($exam->fresh('questions'), true));
    }

    public function destroy(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeExam($request->user(), $exam);
        $exam->delete();

        return response()->json(['message' => 'Exam deleted.']);
    }

    public function start(Request $request, Exam $exam): JsonResponse
    {
        $scheduledFor = $exam->scheduled_for?->toDateString();
        if ($exam->status !== 'Published' || ($scheduledFor && $scheduledFor > now()->toDateString())) {
            abort(404);
        }

        $attempt = Attempt::where('exam_id', $exam->id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $attempt) {
            $now = now();
            try {
                $attempt = Attempt::create([
                    'exam_id' => $exam->id,
                    'user_id' => $request->user()->id,
                    'answers' => [],
                    'score' => 0,
                    'max_score' => (int) $exam->questions()->sum('points'),
                    'started_at' => $now,
                    'expires_at' => $now->copy()->addMinutes($exam->duration_minutes),
                ]);
            } catch (QueryException $error) {
                if (! in_array((string) $error->getCode(), ['23000', '23505'], true)) {
                    throw $error;
                }
                $attempt = Attempt::where('exam_id', $exam->id)
                    ->where('user_id', $request->user()->id)
                    ->firstOrFail();
            }
        }

        if ($attempt->submitted_at) {
            return response()->json(['message' => 'You have already submitted this exam.'], 409);
        }

        return response()->json([
            'id' => (string) $attempt->id,
            'expiresAt' => $attempt->expires_at->toIso8601String(),
            'answers' => $attempt->answers,
        ]);
    }

    public function saveAnswers(Request $request, Exam $exam): JsonResponse
    {
        $validated = $request->validate([
            'answers' => ['required', 'array'],
            'answers.*' => ['nullable', 'string', 'max:2000'],
        ]);

        return $this->transactionWithRecovery(function () use ($request, $exam, $validated): JsonResponse {
            $attempt = Attempt::where('exam_id', $exam->id)
                ->where('user_id', $request->user()->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_if($attempt->submitted_at, 409, 'This exam has already been submitted.');
            abort_if(now()->greaterThan($attempt->expires_at), 410, 'The exam time has expired.');
            $this->validateAnswers($exam, $validated['answers']);
            $attempt->update(['answers' => $validated['answers']]);

            return response()->json(['saved' => true]);
        });
    }

    public function submit(Request $request, Exam $exam): JsonResponse
    {
        if ($exam->status !== 'Published') {
            abort(404);
        }

        $validated = $request->validate([
            'answers' => ['required', 'array'],
            'answers.*' => ['nullable', 'string', 'max:2000'],
        ]);

        $answers = $validated['answers'];
        $attempt = $this->transactionWithRecovery(function () use ($request, $exam, $answers): Attempt {
            $attempt = Attempt::where('exam_id', $exam->id)
                ->where('user_id', $request->user()->id)
                ->lockForUpdate()
                ->firstOrFail();
            abort_if($attempt->submitted_at, 409, 'You have already submitted this exam.');
            if (now()->greaterThan($attempt->expires_at)) {
                $answers = $attempt->answers ?? [];
            }

            $questions = $exam->questions()->get();
            abort_if($questions->isEmpty(), 422, 'This exam has no questions.');
            $this->validateAnswers($exam, $answers);

            $score = 0;
            $maxScore = 0;
            foreach ($questions as $question) {
                $maxScore += $question->points;
                if (isset($answers[(string) $question->id]) && hash_equals($question->answer, $answers[(string) $question->id])) {
                    $score += $question->points;
                }
            }

            $attempt->update([
                'answers' => $answers,
                'score' => $score,
                'max_score' => $maxScore,
                'submitted_at' => now(),
            ]);

            return $attempt->fresh();
        });

        return response()->json([
            'id' => (string) $attempt->id,
            'score' => $attempt->score,
            'maxScore' => $attempt->max_score,
            'percentage' => (int) round(($attempt->score / $attempt->max_score) * 100),
            'submittedAt' => $attempt->submitted_at->toIso8601String(),
        ], 201);
    }

    private function transactionWithRecovery(Closure $callback): mixed
    {
        $connectionName = DB::getDefaultConnection();
        $connection = DB::connection($connectionName);

        try {
            return $connection->transaction($callback);
        } catch (QueryException $error) {
            if ($connection->getDriverName() !== 'pgsql' || $error->getCode() !== '25P02') {
                throw $error;
            }

            DB::purge($connectionName);

            return DB::connection($connectionName)->transaction($callback);
        }
    }

    private function validateAnswers(Exam $exam, array $answers): void
    {
        $questions = $exam->questions()->get()->keyBy(fn ($question): string => (string) $question->id);
        if (array_diff(array_keys($answers), $questions->keys()->all())) {
            throw ValidationException::withMessages([
                'answers' => ['One or more answers refer to a question outside this exam.'],
            ]);
        }

        foreach ($answers as $questionId => $answer) {
            if ($answer !== null && ! in_array($answer, $questions[$questionId]->options, true)) {
                throw ValidationException::withMessages([
                    'answers' => ['An answer is not one of the available options.'],
                ]);
            }
        }
    }

    private function authorizeExam(User $user, Exam $exam): void
    {
        abort_if($user->role === 'teacher' && $exam->created_by !== $user->id, 403);
    }

    private function validateExam(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $payload = $request->validate([
            'title' => [$required, 'string', 'max:255'],
            'subject' => [$required, 'string', 'max:255'],
            'durationMinutes' => [$required, 'integer', 'min:1', 'max:600'],
            'date' => ['sometimes', 'nullable', 'date'],
            'status' => [$required, 'in:Draft,Scheduled,Published'],
            'questions' => [$partial ? 'sometimes' : 'required', 'array', 'min:1'],
            'questions.*.text' => ['required_with:questions', 'string', 'max:10000'],
            'questions.*.options' => ['required_with:questions', 'array', 'min:2', 'max:10'],
            'questions.*.options.*' => ['required', 'string', 'max:2000'],
            'questions.*.answer' => ['required_with:questions', 'string', 'max:2000'],
            'questions.*.points' => ['sometimes', 'integer', 'min:1', 'max:1000'],
        ]);

        foreach ($payload['questions'] ?? [] as $index => $question) {
            if (! in_array($question['answer'], $question['options'], true)) {
                throw ValidationException::withMessages([
                    "questions.$index.answer" => ['The correct answer must match one of the question options.'],
                ]);
            }
        }

        return $payload;
    }

    private function replaceQuestions(Exam $exam, array $questions): void
    {
        foreach (array_values($questions) as $index => $question) {
            $exam->questions()->create([
                'position' => $index + 1,
                'text' => $question['text'],
                'options' => array_values($question['options']),
                'answer' => $question['answer'],
                'points' => $question['points'] ?? 1,
            ]);
        }
    }

    private function examPayload(Exam $exam, bool $includeAnswers): array
    {
        return [
            'id' => (string) $exam->id,
            'title' => $exam->title,
            'subject' => $exam->subject,
            'durationMinutes' => $exam->duration_minutes,
            'date' => $exam->scheduled_for?->format('Y-m-d'),
            'status' => $exam->status,
            'questions' => $exam->questions->map(function ($question) use ($includeAnswers): array {
                $payload = [
                    'id' => (string) $question->id,
                    'text' => $question->text,
                    'options' => $question->options,
                    'points' => $question->points,
                ];
                if ($includeAnswers) {
                    $payload['answer'] = $question->answer;
                }

                return $payload;
            })->values(),
        ];
    }
}
