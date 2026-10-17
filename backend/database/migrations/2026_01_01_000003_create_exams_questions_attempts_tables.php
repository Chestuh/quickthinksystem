<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exams', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('title');
            $table->string('subject');
            $table->unsignedSmallInteger('duration_minutes');
            $table->date('scheduled_for')->nullable();
            $table->enum('status', ['Draft', 'Scheduled', 'Published'])->default('Draft');
            $table->timestamps();
        });

        Schema::create('questions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('position');
            $table->text('text');
            $table->json('options');
            $table->text('answer');
            $table->unsignedSmallInteger('points')->default(1);
            $table->timestamps();
            $table->unique(['exam_id', 'position']);
        });

        Schema::create('attempts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->json('answers');
            $table->unsignedInteger('score');
            $table->unsignedInteger('max_score');
            $table->timestamp('started_at');
            $table->timestamp('expires_at');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
            $table->unique(['exam_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attempts');
        Schema::dropIfExists('questions');
        Schema::dropIfExists('exams');
    }
};
