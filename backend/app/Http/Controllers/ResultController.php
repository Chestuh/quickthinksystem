<?php

namespace App\Http\Controllers;

use App\Models\Attempt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResultController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Attempt::with(['exam', 'user'])->whereNotNull('submitted_at')->latest('submitted_at');
        if ($request->user()->role === 'student') {
            $query->where('user_id', $request->user()->id);
        } elseif ($request->user()->role === 'teacher') {
            $query->whereHas('exam', fn ($examQuery) => $examQuery->where('created_by', $request->user()->id));
        }

        return response()->json($query->get()->map(fn (Attempt $attempt): array => [
            'id' => (string) $attempt->id,
            'studentId' => (string) $attempt->user_id,
            'studentName' => $attempt->user->name,
            'examId' => (string) $attempt->exam_id,
            'examTitle' => $attempt->exam->title,
            'score' => $attempt->max_score ? (int) round(($attempt->score / $attempt->max_score) * 100) : 0,
            'pointsEarned' => $attempt->score,
            'maxPoints' => $attempt->max_score,
            'date' => $attempt->submitted_at->toDateString(),
        ]));
    }
}
