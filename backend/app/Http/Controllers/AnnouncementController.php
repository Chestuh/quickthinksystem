<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function index(): JsonResponse
    {
        $announcements = Announcement::query()
            ->with('author:id,name')
            ->latest()
            ->get()
            ->map(fn (Announcement $announcement): array => $this->payload($announcement));

        return response()->json($announcements);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'body' => ['required', 'string', 'max:5000'],
        ]);
        $announcement = Announcement::create([
            ...$validated,
            'created_by' => $request->user()->id,
        ]);
        $announcement->load('author:id,name');

        return response()->json($this->payload($announcement), 201);
    }

    public function destroy(Announcement $announcement): JsonResponse
    {
        $announcement->delete();

        return response()->json(['message' => 'Announcement deleted.']);
    }

    private function payload(Announcement $announcement): array
    {
        return [
            'id' => (string) $announcement->id,
            'title' => $announcement->title,
            'body' => $announcement->body,
            'authorName' => $announcement->author?->name,
            'createdAt' => $announcement->created_at->toISOString(),
        ];
    }
}
