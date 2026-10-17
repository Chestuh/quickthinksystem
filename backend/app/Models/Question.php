<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Question extends Model
{
    protected $fillable = ['exam_id', 'position', 'text', 'options', 'answer', 'points'];

    protected $hidden = ['answer'];

    protected function casts(): array
    {
        return ['options' => 'array', 'points' => 'integer'];
    }
}
