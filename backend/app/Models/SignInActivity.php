<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SignInActivity extends Model
{
    protected $table = 'sign_in_activity';

    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'user_name',
        'user_email',
        'user_role',
        'signed_in_at',
    ];

    protected function casts(): array
    {
        return ['signed_in_at' => 'datetime'];
    }
}
