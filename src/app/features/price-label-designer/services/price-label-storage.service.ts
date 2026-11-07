import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { HANDLES_REQUEST_ERRORS } from '../../../core/auth/auth.interceptor';
import { LabelTemplate } from '../../../core/models/price-label-template.model';

@Injectable({ providedIn: 'root' })
export class PriceLabelStorageService {
  private templatesSubject = new BehaviorSubject<LabelTemplate[]>([]);
  readonly templates$ = this.templatesSubject.asObservable();
  readonly ready: Promise<void>;
  readonly error$ = new BehaviorSubject('');
  private revisions = new Map<string, number>();
  revision(id: string): number | undefined { return this.revisions.get(id); }
  private options(revision?: number): { headers: Record<string, string>; context: HttpContext } {
    return { headers: revision === undefined ? {} : { 'If-Match': '"' + revision + '"' }, context: new HttpContext().set(HANDLES_REQUEST_ERRORS, true) };
  }
  async refresh(): Promise<void> { await this.init(); }
  async fetch(id: string): Promise<LabelTemplate> {
    const row = await firstValueFrom(this.http.get<any>('/api/templates/' + id, this.options()));
    const template = this.apiToTemplate(row);
    this.templatesSubject.next([...this.getAll().filter(t => t.id !== template.id), template]);
    return template;
  }
  constructor(private http: HttpClient) { this.ready = this.init(); }
  private async init(): Promise<void> {
    try {
      this.error$.next('');
      const rows = await firstValueFrom(this.http.get<any[]>('/api/templates', this.options()));
      this.templatesSubject.next(rows.filter(row => row?.template_json?.type === 'price-label').map(row => this.apiToTemplate(row)));
    } catch { this.error$.next('No se pudieron cargar las plantillas. Puedes reintentar.'); }
  }
  getAll(): LabelTemplate[] { return this.templatesSubject.value; }
  getById(id: string): LabelTemplate | undefined { return this.getAll().find(t => t.id === id); }
  async save(template: LabelTemplate, revision?: number, asCopy = false): Promise<LabelTemplate> {
    await this.ready;
    const existingTemplate = asCopy ? undefined : (this.getById(template.id) ?? (revision !== undefined ? template : undefined));
    const row = await firstValueFrom(existingTemplate
      ? existingTemplate.name === template.name
        ? this.http.put<any>('/api/templates/' + template.id + '/design', { template_json: template }, this.options(revision))
        : this.http.put<any>('/api/templates/' + template.id, { nombre: template.name, template_json: template }, this.options(revision))
      : this.http.post<any>('/api/templates', { nombre: template.name, template_json: template }));
    const saved = this.apiToTemplate(row);
    const existing = this.getById(saved.id);
    this.templatesSubject.next(existing ? this.getAll().map(t => t.id === saved.id ? saved : t) : [...this.getAll(), saved]);
    return saved;
  }
  async delete(id: string, revision?: number): Promise<void> {
    await firstValueFrom(this.http.delete('/api/templates/' + id, this.options(revision)));
    this.templatesSubject.next(this.getAll().filter(t => t.id !== id));
  }
  private apiToTemplate(row: any): LabelTemplate {
    this.revisions.set(row.id, row.version ?? 0);
    return { ...row.template_json, id: row.id, name: row.nombre };
  }
}
