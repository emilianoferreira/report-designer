import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  constructor(public auth: AuthService) {}
  async changeCompany(id: string, select: HTMLSelectElement): Promise<void> {
    if (id === this.auth.session?.company_id || !confirm('Cambiar de empresa descartará los cambios sin guardar. ¿Continuar?')) {
      select.value = this.auth.session!.company_id; return;
    }
    try { await this.auth.switchCompany(id); } catch { select.value = this.auth.session!.company_id; this.auth.error$.next('No se pudo cambiar de empresa.'); }
  }
  async logout(): Promise<void> {
    if (!confirm('Cerrar sesión descartará los cambios sin guardar. ¿Continuar?')) return;
    try { await this.auth.logout(); } catch { this.auth.error$.next('No se pudo cerrar la sesión.'); }
  }
  title = 'zureo-report-designer';
}
