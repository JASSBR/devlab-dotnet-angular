import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

/** Per-request flag: login/refresh calls must not carry (or refresh) a token. */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

/**
 * Functional interceptor (Angular 15+): a plain function, composable with withInterceptors().
 * 1. Attach "Authorization: Bearer" to /api calls when we have a token.
 * 2. On 401, try ONE refresh, then replay the original request with the new token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore);

  if (req.context.get(SKIP_AUTH) || !req.url.startsWith('/api') || req.headers.has('Authorization') || req.headers.has('X-Api-Key'))
    return next(req);

  const token = auth.accessToken();
  const authed = token ? withBearer(req, token) : req;

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      const canRefresh = err.status === 401 && !!auth.refreshToken() && !req.url.includes('/auth/cookie') && !req.url.includes('/auth/oidc');
      if (!canRefresh) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap(pair => next(withBearer(req, pair.accessToken))),   // replay with fresh token
        catchError(refreshErr => { auth.logout(); return throwError(() => refreshErr); }),
      );
    }),
  );
};

const withBearer = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
