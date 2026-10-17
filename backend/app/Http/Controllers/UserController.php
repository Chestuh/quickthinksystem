<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(User::query()->latest()->get()->map(fn (User $user): array => $this->payload($user)));
    }

    public function store(Request $request): JsonResponse
    {
        $request->merge(['email' => mb_strtolower(trim((string) $request->input('email')))]);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:10'],
            'role' => ['required', 'in:admin,teacher,student'],
        ]);
        $user = User::create([
            ...$validated,
            'email' => mb_strtolower($validated['email']),
            'password' => Hash::make($validated['password']),
        ]);

        return response()->json($this->payload($user), 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        if ($request->has('email')) {
            $request->merge(['email' => mb_strtolower(trim((string) $request->input('email')))]);
        }
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'password' => ['sometimes', 'string', 'min:10'],
            'role' => ['sometimes', 'in:admin,teacher,student'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        if ($user->is($request->user()) && ($validated['isActive'] ?? true) === false) {
            return response()->json(['message' => 'You cannot deactivate your own account.'], 422);
        }
        if ($user->is($request->user()) && isset($validated['role']) && $validated['role'] !== 'admin') {
            return response()->json(['message' => 'You cannot remove your own administrator role.'], 422);
        }

        if (isset($validated['email'])) {
            $validated['email'] = mb_strtolower($validated['email']);
        }
        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }
        if (array_key_exists('isActive', $validated)) {
            $validated['is_active'] = $validated['isActive'];
            unset($validated['isActive']);
        }
        $user->update($validated);
        if (! $user->is_active) {
            $user->tokens()->delete();
        }

        return response()->json($this->payload($user->fresh()));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_if($user->is($request->user()), 422, 'You cannot delete your own account.');
        if ($user->exams()->exists()) {
            return response()->json(['message' => 'This account owns exams. Reassign or delete those exams before deleting the account.'], 409);
        }
        $user->delete();

        return response()->json(['message' => 'User deleted.']);
    }

    private function payload(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'isActive' => $user->is_active,
        ];
    }
}
