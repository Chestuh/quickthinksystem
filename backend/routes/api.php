<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\ExamController;
use App\Http\Controllers\ResultController;
use App\Http\Controllers\SignInActivityController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/exams', [ExamController::class, 'index']);
    Route::get('/exams/{exam}', [ExamController::class, 'show']);
    Route::get('/results', [ResultController::class, 'index']);
    Route::get('/announcements', [AnnouncementController::class, 'index']);
    Route::middleware('role:student')->group(function (): void {
        Route::post('/exams/{exam}/start', [ExamController::class, 'start']);
        Route::put('/exams/{exam}/answers', [ExamController::class, 'saveAnswers']);
        Route::post('/exams/{exam}/submit', [ExamController::class, 'submit']);
    });

    Route::middleware('role:admin,teacher')->group(function (): void {
        Route::post('/exams', [ExamController::class, 'store']);
        Route::put('/exams/{exam}', [ExamController::class, 'update']);
        Route::delete('/exams/{exam}', [ExamController::class, 'destroy']);
    });

    Route::middleware('role:admin')->group(function (): void {
        Route::get('/sign-in-activity', [SignInActivityController::class, 'index']);
        Route::post('/announcements', [AnnouncementController::class, 'store']);
        Route::delete('/announcements/{announcement}', [AnnouncementController::class, 'destroy']);
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{user}', [UserController::class, 'update']);
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
    });
});
