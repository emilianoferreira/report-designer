import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';

@Component({ standalone: true, imports: [FormsModule], selector: 'app-login', template: `
  <main class="login"><h1>Iniciar sesión</h1>
    <form (ngSubmit)="submit()">
      <label>Correo electrónico<input name="email" type="email" autocomplete="username" [(ngModel)]="email" required maxlength="254"></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" [(ngModel)]="password" required maxlength="1024"></label>
      <button type="submit" [disabled]="busy">Ingresar</button>
      <p role="alert">{{ error }}</p>
    </form>
  </main>`, styles: [` .login{max-width:380px;margin:10vh auto;padding:24px}label{display:block;margin:16px 0}input{display:block;width:100%;padding:10px;box-sizing:border-box}button{padding:10px 24px}[role=alert]{color:#a32222}`] })
export class LoginComponent {
  email = ''; password = ''; error = ''; busy = false;
  constructor(private auth: AuthService) {}
  async submit(): Promise<void> {
    this.busy = true; this.error = '';
    try { await this.auth.login(this.email, this.password); this.password = ''; window.location.assign('/templates'); }
    catch (error: any) { this.password = ''; this.error = error.status === 429 ? 'Demasiados intentos. Inténtalo en 15 minutos.' : 'No se pudo iniciar sesión. Verifica tus credenciales y la conexión.'; }
    finally { this.busy = false; }
  }
}
