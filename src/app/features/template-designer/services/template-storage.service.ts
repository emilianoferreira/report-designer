import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { TemplateMold, CompanyDocumentType, ReportTemplate } from '../../../core/models/template.model';
import { AuthService } from '../../../core/auth/auth.service';
import { createDefaultTemplate } from '../data/default-template';

@Injectable({ providedIn: 'root' })
export class TemplateStorageService {
  private moldsSubject = new BehaviorSubject<TemplateMold[]>([]);
  readonly molds$ = this.moldsSubject.asObservable();
  readonly ready: Promise<void>;
  constructor(private http: HttpClient, private auth: AuthService) { this.ready = this.init(); }
  private async init(): Promise<void> {
    try {
      const rows = await firstValueFrom(this.http.get<any[]>('/api/templates'));
      this.moldsSubject.next(rows.filter(t => t?.template_json?.type !== 'price-label').map(t => this.apiToMold(t)));
    } catch { this.moldsSubject.next([]); }
  }
  getAll(): TemplateMold[] { return this.moldsSubject.value; }
  getById(id: string): TemplateMold | undefined { return this.getAll().find(m => m.id === id); }
  async create(name: string, documentType: CompanyDocumentType, description = '', companyId?: string): Promise<TemplateMold> {
    const template = createDefaultTemplate();
    template.metadata.name = name;
    template.metadata.companyId = this.auth.session!.company_id;
    const row = await firstValueFrom(this.http.post<any>('/api/templates', {
      nombre: name, descripcion: description, template_json: { documentType, template }
    }));
    const mold = this.apiToMold(row);
    this.moldsSubject.next([...this.getAll(), mold]);
    return mold;
  }
  async updateMetadata(id: string, changes: Partial<Pick<TemplateMold, 'name' | 'description' | 'documentType'>>): Promise<TemplateMold | undefined> {
    const mold = this.getById(id);
    if (!mold) return undefined;
    const row = await firstValueFrom(this.http.put<any>('/api/templates/' + id, {
      nombre: changes.name || mold.name, descripcion: changes.description ?? mold.description
    }));
    return this.replace(this.apiToMold(row));
  }
  async saveTemplate(id: string, template: ReportTemplate): Promise<TemplateMold | undefined> {
    const mold = this.getById(id);
    if (!mold) return undefined;
    const row = await firstValueFrom(this.http.put<any>('/api/templates/' + id + '/design', {
      template_json: { documentType: mold.documentType, template }
    }));
    return this.replace(this.apiToMold(row));
  }
  async delete(id: string): Promise<boolean> {
    await firstValueFrom(this.http.delete('/api/templates/' + id));
    this.moldsSubject.next(this.getAll().filter(m => m.id !== id));
    return true;
  }
  async duplicate(id: string): Promise<TemplateMold | undefined> {
    const row = await firstValueFrom(this.http.post<any>('/api/templates/' + id + '/duplicate', {}));
    const mold = this.apiToMold(row);
    this.moldsSubject.next([...this.getAll(), mold]);
    return mold;
  }
  private apiToMold(row: any): TemplateMold {
    const json = row.template_json || {};
    return { id: row.id, name: row.nombre || json.template?.metadata?.name || 'Sin nombre',
      documentType: json.documentType || 'venta_contado', description: row.descripcion || '',
      companyId: row.company_id, createdAt: row.created_at, updatedAt: row.updated_at,
      template: json.template || createDefaultTemplate() };
  }
  private replace(mold: TemplateMold): TemplateMold {
    this.moldsSubject.next(this.getAll().map(m => m.id === mold.id ? mold : m));
    return mold;
  }
}
