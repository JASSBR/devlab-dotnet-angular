import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

/** canActivate: runs AFTER the route matched. Redirects with a returnUrl. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/lessons/auth-jwt'], { queryParams: { returnUrl: state.url } });
};

/**
 * canMatch: runs BEFORE the route matches → the router keeps looking for another
 * route with the same path. Lets you serve different components per role,
 * and never even downloads a lazy chunk the user cannot see.
 */
export const hasRoleMatch = (role: string): CanMatchFn => () => inject(AuthStore).hasRole(role);
