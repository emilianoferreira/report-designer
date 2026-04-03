/**
 * API Service
 * Central HTTP client for communicating with the NestJS backend.
 * All API calls go through this service.
 */
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(private http: HttpClient) {}

  // ─── Templates ───

  getTemplates(companyId: string = 'c1000000-0000-0000-0000-000000000001'): Observable<any[]> {
    return this.http.get<any[]>(`/api/templates?companyId=${companyId}`);
  }

  getTemplate(id: string): Observable<any> {
    return this.http.get<any>(`/api/templates/${id}`);
  }

  createTemplate(data: {
    nombre: string;
    company_id?: string;
    descripcion?: string;
    template_json: Record<string, any>;
  }): Observable<any> {
    return this.http.post<any>('/api/templates', data);
  }

  updateTemplate(id: string, data: Partial<{
    nombre: string;
    descripcion: string;
    estado: string;
    template_json: Record<string, any>;
  }>): Observable<any> {
    return this.http.put<any>(`/api/templates/${id}`, data);
  }

  saveTemplateDesign(id: string, templateJson: Record<string, any>): Observable<any> {
    return this.http.put<any>(`/api/templates/${id}/design`, { template_json: templateJson });
  }

  duplicateTemplate(id: string): Observable<any> {
    return this.http.post<any>(`/api/templates/${id}/duplicate`, {});
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`/api/templates/${id}`);
  }

  // ─── Invoices ───

  getInvoices(companyId: string = 'c1000000-0000-0000-0000-000000000001'): Observable<any[]> {
    return this.http.get<any[]>(`/api/invoices?companyId=${companyId}`);
  }

  getInvoiceData(invoiceId: string): Observable<Record<string, any>> {
    return this.http.get<Record<string, any>>(`/api/invoices/${invoiceId}/data`);
  }
}
