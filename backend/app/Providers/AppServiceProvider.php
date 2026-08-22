<?php

namespace App\Providers;

use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (
            request()->header('x-forwarded-proto') === 'https' ||
            str_contains(request()->header('host', ''), 'trycloudflare.com') ||
            str_contains(config('app.url'), 'https://')
        ) {
            URL::forceScheme('https');
        }
    }
}
