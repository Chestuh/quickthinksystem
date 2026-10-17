<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attempt extends Model
{
    protected $fillable = ['exam_id', 'user_id', 'answers', 'score', 'max_score', 'started_at', 'expires_at', 'submitted_at'];

    protected function casts(): array
    {
        return [
            'answers' => 'array',
            'score' => 'integer',
            'max_score' => 'integer',
            'started_at' => 'datetime',
            'expires_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }

    public function exam(): BelongsTo
    {
        return $this->belongsTo(Exam::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
