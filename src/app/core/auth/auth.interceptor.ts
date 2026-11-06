import { inject } from '@angular/core';
import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const HANDLES_REQUEST_ERRORS = new HttpContextToken(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const auth = inject(AuthService);
  const session = auth.session;
  if (session && !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    request = request.clone({ setHeaders: { 'X-CSRF-Token': session.csrf_token } });
  return next(request).pipe(catchError(error => {
    if (request.context.get(HANDLES_REQUEST_ERRORS) && error.status !== 401 && error.status !== 403)
      return throwError(() => error);
    auth.error$.next(error.status === 401 ? 'La sesión venció. Inicia sesión para continuar; los cambios no se guardaron.'
      : error.status === 403 ? 'No tienes permiso para esta operación.' : 'No se pudo completar la operación. Comprueba la conexión e inténtalo nuevamente.');
    return throwError(() => error);
  }));
};
