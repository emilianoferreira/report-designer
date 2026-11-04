import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { LabelTemplate } from '../../../core/models/price-label-template.model';

@Injectable({ providedIn: 'root' })
export class PriceLabelStorageService {
  private templatesSubject = new BehaviorSubject<LabelTemplate[]>([]);
  readonly templates$ = this.templatesSubject.asObservable();
  readonly ready: Promise<void>;
  constructor(private http: HttpClient) { this.ready = this.init(); }
  private async init(): Promise<void> {
    try {
      const rows = await firstValueFrom(this.http.get<any[]>('/api/templates'));
      this.templatesSubject.next(rows.filter(row => row?.template_json?.type === 'price-label').map(row => this.apiToTemplate(row)));
    } catch { this.templatesSubject.next([]); }
  }
  getAll(): LabelTemplate[] { return this.templatesSubject.value; }
  getById(id: string): LabelTemplate | undefined { return this.getAll().find(t => t.id === id); }
  async save(template: LabelTemplate): Promise<LabelTemplate> {
    const row = await firstValueFrom(this.getById(template.id)
      ? this.http.put<any>('/api/templates/' + template.id + '/design', { template_json: template })
      : this.http.post<any>('/api/templates', { nombre: template.name, template_json: template }));
    const saved = this.apiToTemplate(row);
    const existing = this.getById(saved.id);
    this.templatesSubject.next(existing ? this.getAll().map(t => t.id === saved.id ? saved : t) : [...this.getAll(), saved]);
    return saved;
  }
  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete('/api/templates/' + id));
    this.templatesSubject.next(this.getAll().filter(t => t.id !== id));
  }
  private apiToTemplate(row: any): LabelTemplate {
    return { ...row.template_json, id: row.id, name: row.nombre };
  }
}
