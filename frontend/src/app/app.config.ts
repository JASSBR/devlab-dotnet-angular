import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { ApplicationConfig, LOCALE_ID, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { RuntimeConfigService } from './core/http/runtime-config';
import { requestLogInterceptor } from './core/http/request-log.interceptor';

/**
 * Application-level providers. Angular 22 is zoneless by default: no zone.js,
 * change detection is scheduled by signals / events / async pipe — nothing else.
 */
registerLocaleData(localeFr);   // CurrencyPipe/DatePipe → « 129,90 € » instead of « €129.90 »

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'fr' },
    provideRouter(
      routes,
      withComponentInputBinding(),          // route params & data become component inputs
      withViewTransitions(),                // native View Transitions API between routes
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(
      // Interceptors run in array order for the request, reverse order for the response.
      withInterceptors([authInterceptor, requestLogInterceptor]),
      // Angular's built-in CSRF support: reads the XSRF-TOKEN cookie, sends it as X-XSRF-TOKEN on POST/PUT/DELETE.
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),
    // Runs before the app renders; returning a promise makes Angular wait for it.
    provideAppInitializer(() => inject(RuntimeConfigService).load()),
  ],
};
