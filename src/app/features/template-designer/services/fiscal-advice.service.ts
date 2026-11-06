import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, defer, map, of, shareReplay } from 'rxjs';
import { HANDLES_REQUEST_ERRORS } from '../../../core/auth/auth.interceptor';

@Injectable({ providedIn: 'root' })
export class FiscalAdviceService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/fiscal/advice';
  private readonly context = new HttpContext().set(HANDLES_REQUEST_ERRORS, true);
  readonly ruleIds$ = defer(() => this.http.get<{ ruleIds: string[] }>(this.url, { context: this.context })).pipe(
    map(response => response.ruleIds),
    catchError(() => of([] as string[])),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  explain(ruleId: string, status: 'fail' | 'pending') {
    return this.http.post<{ explanation: string }>(this.url, { ruleId, status }, { context: this.context });
  }
}
