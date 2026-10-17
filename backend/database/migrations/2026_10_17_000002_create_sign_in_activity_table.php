<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sign_in_activity', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('user_name');
            $table->string('user_email');
            $table->string('user_role', 20);
            $table->timestamp('signed_in_at')->useCurrent();
            $table->index('signed_in_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sign_in_activity');
    }
};
