import { Injectable, NotFoundException, ForbiddenException, Inject, ConflictException, BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { companyId } from '../../auth/auth.module';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplate } from '../../entities';

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    @InjectRepository(ReportTemplate)
    private readonly repo: Repository<ReportTemplate>,
  ) {}

  /** List all templates for a company */
  async findAll(companyId: string): Promise<ReportTemplate[]> {
    this.assertCompany(companyId);
    return this.repo.find({
      where: { company_id: companyId },
      order: { updated_at: 'DESC' },
    });
  }

  /** Get a single template by ID */
  async findOne(id: string): Promise<ReportTemplate> {
    const tpl = await this.repo.findOne({ where: { id, company_id: this.company } });
    if (!tpl) throw new NotFoundException(`Template ${id} not found`);
    return tpl;
  }

  /** Create a new template */
  async create(data: Partial<ReportTemplate>): Promise<ReportTemplate> {
    this.assertCompany(data.company_id!);
    const tpl = this.repo.create(data);
    return this.repo.save(tpl);
  }

  /** Update template metadata or JSON */
  async update(id: string, data: Partial<ReportTemplate>): Promise<ReportTemplate> {
    return this.change(id, async (repo, tpl) => {
    for (const key of ['id', 'company_id', 'company', 'created_at', 'updated_at'])
      if (Object.prototype.hasOwnProperty.call(data, key)) throw new ForbiddenException();
    if (data.based_on != null) await this.findOne(data.based_on);
    // Never pass relation objects, prototypes or arbitrary entity fields to TypeORM.
    for (const key of ['nombre', 'descripcion', 'version', 'autor', 'tags', 'estado', 'template_json', 'based_on'])
      if ((key !== 'version' || this.request.headers['if-match'] === undefined) && Object.prototype.hasOwnProperty.call(data, key)) (tpl as any)[key] = data[key];
    tpl.version = (tpl.version || 1) + 1;
    return repo.save(tpl);
    });
  }

  /** Save only the template_json (design) */
  async saveDesign(id: string, templateJson: Record<string, any>): Promise<ReportTemplate> {
    return this.change(id, async (repo, tpl) => {
    tpl.template_json = templateJson;
    tpl.version = (tpl.version || 1) + 1;
    return repo.save(tpl);
    });
  }

  /** Duplicate a template */
  async duplicate(id: string): Promise<ReportTemplate> {
    return this.change(id, async (repo, original) => {
    const cloned = repo.create({
      ...original,
      id: undefined,
      nombre: `${original.nombre} (copia)`,
      version: 1,
      created_at: undefined,
      updated_at: undefined,
    });
    return repo.save(cloned);
    });
  }

  /** Delete a template */
  async remove(id: string): Promise<void> {
    await this.change(id, async (repo, tpl) => { await repo.remove(tpl); });
  }
  private change<T>(id: string, work: (repo: Repository<ReportTemplate>, row: ReportTemplate) => Promise<T>): Promise<T> {
    return this.repo.manager.transaction(async manager => {
      const repo = manager.getRepository(ReportTemplate);
      const row = await repo.findOne({ where: { id, company_id: this.company }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new NotFoundException(`Template ${id} not found`);
      const revision = this.request.headers['if-match'];
      if (revision !== undefined) {
        if (typeof revision !== 'string' || !/^"[0-9]+"$/.test(revision) || Number(revision.slice(1,-1)) > 2147483647) throw new BadRequestException('Invalid If-Match revision');
        if (Number(revision.slice(1,-1)) !== (row.version ?? 0)) throw new ConflictException('Template revision conflict');
      }
      return work(repo, row);
    });
  }
  get company(): string { return this.request.auth.company_id; }
  private assertCompany(value: string) { if (companyId(value) !== this.company) throw new ForbiddenException(); }
}
