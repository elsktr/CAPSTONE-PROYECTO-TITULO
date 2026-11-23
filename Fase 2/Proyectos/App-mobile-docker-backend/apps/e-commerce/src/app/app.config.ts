import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation, withNavigationErrorHandler } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { recargarSiCambioLaVersion } from './core/version-nueva';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Una pestaña abierta antes de publicar una versión nueva se recarga al cambiar de pantalla.
    provideRouter(routes, withHashLocation(), withNavigationErrorHandler(recargarSiCambioLaVersion)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideIonicAngular({ mode: 'md' }),
    provideAnimations(),
  ],
};
