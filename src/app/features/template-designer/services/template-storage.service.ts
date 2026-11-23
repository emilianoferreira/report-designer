import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { TemplateMold, CompanyDocumentType, ReportTemplate } from '../../../core/models/template.model';
import { AuthService } from '../../../core/auth/auth.service';
import { HANDLES_REQUEST_ERRORS } from '../../../core/auth/auth.interceptor';
import { createDefaultTemplate } from '../data/default-template';
import { createReportStartingPoint, ReportStartingPoint } from '../data/blank-report';

@Injectable({ providedIn: 'root' })
export class TemplateStorageService {
  private readonly pendingDesignSaves = new Map<string, Promise<TemplateMold | undefined>>();
  private moldsSubject = new BehaviorSubject<TemplateMold[]>([]);
  readonly molds$ = this.moldsSubject.asObservable();
  readonly error$ = new BehaviorSubject('');
  readonly ready: Promise<void>;
  constructor(private http: HttpClient, private auth: AuthService) { this.ready = this.init(); }
  async refresh(): Promise<void> { await this.init(); }
  async readyForEditor(id: string): Promise<void> {
    await this.ready;
    // On failure the cache still contains the last confirmed design.
    await this.pendingDesignSaves.get(id)?.catch(() => undefined);
  }
  private async init(): Promise<void> {
    try {
      const rows = await firstValueFrom(this.http.get<any[]>('/api/templates'));
      this.moldsSubject.next(rows.filter(t => t?.template_json?.type !== 'price-label').map(t => this.apiToMold(t)));
      this.error$.next('');
    } catch { this.error$.next('No se pudieron cargar los moldes de comprobantes.'); }
  }
  getAll(): TemplateMold[] { return this.moldsSubject.value; }
  getById(id: string): TemplateMold | undefined { return this.getAll().find(m => m.id === id); }
  private revisionOptions(revision: number | undefined) {
    if (revision === undefined) throw new Error('Report revision unavailable');
    return { headers: { 'If-Match': '"' + revision + '"' },
      context: new HttpContext().set(HANDLES_REQUEST_ERRORS, true) };
  }
  async fetch(id: string): Promise<TemplateMold> {
    const row = await firstValueFrom(this.http.get<any>('/api/templates/' + encodeURIComponent(id)));
    if (row?.id !== id || !row.template_json?.template || row.template_json.type === 'price-label') {
      throw new HttpErrorResponse({ status: 404 });
    }
    return this.replace(this.apiToMold(row));
  }
  async saveCopy(mold: TemplateMold, template: ReportTemplate): Promise<TemplateMold> {
    const name = mold.name + ' (copia)';
    const row = await firstValueFrom(this.http.post<any>('/api/templates', {
      nombre: name, descripcion: mold.description,
      template_json: { documentType: mold.documentType, template }
    }));
    if (!row?.id || row.id === mold.id || !row.template_json?.template) throw new Error('Unconfirmed report copy');
    const copy = this.apiToMold(row);
    this.moldsSubject.next([...this.getAll().filter(item => item.id !== copy.id), copy]);
    return copy;
  }
  async create(name: string, documentType: CompanyDocumentType, description = '', startingPoint: ReportStartingPoint = 'example'): Promise<TemplateMold> {
    const template = createReportStartingPoint(startingPoint);
    template.metadata.name = name;
    template.metadata.companyId = this.auth.session!.company_id;
    const row = await firstValueFrom(this.http.post<any>('/api/templates', {
      nombre: name, descripcion: description, template_json: { documentType, template }
    }));
    const mold = this.apiToMold(row);
    this.moldsSubject.next([...this.getAll(), mold]);
    return mold;
  }
  async updateMetadata(id: string, changes: Partial<Pick<TemplateMold, 'name' | 'description' | 'documentType'>>,
    revision: number | undefined): Promise<TemplateMold | undefined> {
    const mold = this.getById(id);
    if (!mold) return undefined;
    const row = await firstValueFrom(this.http.put<any>('/api/templates/' + id, {
      nombre: changes.name || mold.name, descripcion: changes.description ?? mold.description
    }, this.revisionOptions(revision)));
    return this.replace(this.apiToMold(row));
  }
  async saveTemplate(mold: TemplateMold, template: ReportTemplate): Promise<TemplateMold | undefined> {
    const id = mold.id;
    if (this.pendingDesignSaves.has(id)) return undefined;
    const save = firstValueFrom(this.http.put<any>('/api/templates/' + id + '/design', {
      template_json: { documentType: mold.documentType, template }
    }, this.revisionOptions(mold.revision))).then(row => row?.id === id ? this.replace(this.apiToMold(row)) : undefined);
    this.pendingDesignSaves.set(id, save);
    try {
      return await save;
    } finally {
      this.pendingDesignSaves.delete(id);
    }
  }
  async delete(id: string, revision: number | undefined): Promise<boolean> {
    await firstValueFrom(this.http.delete('/api/templates/' + id, this.revisionOptions(revision)));
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
    const revision = row.version === null ? 0 : row.version;
    return { id: row.id, revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined,
      name: row.nombre || json.template?.metadata?.name || 'Sin nombre',
      documentType: json.documentType || 'venta_contado', description: row.descripcion || '',
      companyId: row.company_id, createdAt: row.created_at, updatedAt: row.updated_at,
      template: json.template || createDefaultTemplate() };
  }
  private replace(mold: TemplateMold): TemplateMold {
    this.moldsSubject.next(this.getAll().map(m => m.id === mold.id ? mold : m));
    return mold;
  }
}
