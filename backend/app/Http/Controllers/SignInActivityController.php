<?php

namespace App\Http\Controllers;

use App\Models\SignInActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SignInActivityController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'after' => ['sometimes', 'integer', 'min:0'],
        ]);
        $afterId = $validated['after'] ?? null;
        $query = SignInActivity::query();

        if ($afterId !== null) {
            $query->where('id', '>', $afterId)
                ->orderBy('id')
                ->limit(50);
        } else {
            $query->orderByDesc('signed_in_at')
                ->orderByDesc('id')
                ->limit(10);
        }

        $activity = $query
            ->get()
            ->map(fn (SignInActivity $entry): array => [
                'id' => (string) $entry->id,
                'userId' => $entry->user_id === null ? null : (string) $entry->user_id,
                'name' => $entry->user_name,
                'email' => $entry->user_email,
                'role' => $entry->user_role,
                'signedInAt' => $entry->signed_in_at->toIso8601String(),
            ]);

        return response()->json($activity);
    }
}
