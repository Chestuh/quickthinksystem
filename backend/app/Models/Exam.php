<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Exam extends Model
{
    protected $fillable = [
        'created_by',
        'title',
        'subject',
        'duration_minutes',
        'scheduled_for',
        'status',
    ];

    protected function casts(): array
    {
        return ['scheduled_for' => 'date:Y-m-d'];
    }

    public function questions(): HasMany
    {
        return $this->hasMany(Question::class)->orderBy('position');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(Attempt::class);
    }
}
