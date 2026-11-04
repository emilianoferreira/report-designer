import { Injectable } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

export interface Session {
  user: { id: string; email: string };
  company_id: string;
  role: 'editor' | 'viewer';
  csrf_token: string;
  expires_at: string;
  companies: { id: string; name: string; role: string }[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  // The session menu already confirms discarding drafts before these transitions.
  leavingSession = false;
  private http: HttpClient;
  readonly session$ = new BehaviorSubject<Session | null>(null);
  readonly error$ = new BehaviorSubject('');
  get session(): Session | null { return this.session$.value; }
  constructor(backend: HttpBackend) { this.http = new HttpClient(backend); }
  async restore(): Promise<void> {
    try { this.session$.next(await firstValueFrom(this.http.get<Session>('/api/auth/session'))); }
    catch { this.session$.next(null); }
  }
  async login(email: string, password: string): Promise<void> {
    const session = await firstValueFrom(this.http.post<Session>('/api/auth/login', { email, password }, { headers: { 'X-CSRF-Token': 'login' } }));
    this.error$.next(''); this.session$.next(session);
  }
  async switchCompany(company_id: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/company', { company_id }, { headers: { 'X-CSRF-Token': this.session!.csrf_token } }));
    this.leavingSession = true;
    // A full navigation clears both editors, their histories and all in-memory lists.
    window.location.assign('/templates');
  }
  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}, { headers: { 'X-CSRF-Token': this.session!.csrf_token } }));
    this.leavingSession = true;
    window.location.assign('/login');
  }
}
