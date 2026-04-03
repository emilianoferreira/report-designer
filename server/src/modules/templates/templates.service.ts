import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplate } from '../../entities';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(ReportTemplate)
    private readonly repo: Repository<ReportTemplate>,
  ) {}

  /** List all templates for a company */
  async findAll(companyId: string): Promise<ReportTemplate[]> {
    return this.repo.find({
      where: { company_id: companyId },
      order: { updated_at: 'DESC' },
    });
  }

  /** Get a single template by ID */
  async findOne(id: string): Promise<ReportTemplate> {
    const tpl = await this.repo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException(`Template ${id} not found`);
    return tpl;
  }

  /** Create a new template */
  async create(data: Partial<ReportTemplate>): Promise<ReportTemplate> {
    const tpl = this.repo.create(data);
    return this.repo.save(tpl);
  }

  /** Update template metadata or JSON */
  async update(id: string, data: Partial<ReportTemplate>): Promise<ReportTemplate> {
    const tpl = await this.findOne(id);
    Object.assign(tpl, data);
    tpl.version = (tpl.version || 1) + 1;
    return this.repo.save(tpl);
  }

  /** Save only the template_json (design) */
  async saveDesign(id: string, templateJson: Record<string, any>): Promise<ReportTemplate> {
    const tpl = await this.findOne(id);
    tpl.template_json = templateJson;
    tpl.version = (tpl.version || 1) + 1;
    return this.repo.save(tpl);
  }

  /** Duplicate a template */
  async duplicate(id: string): Promise<ReportTemplate> {
    const original = await this.findOne(id);
    const cloned = this.repo.create({
      ...original,
      id: undefined,
      nombre: `${original.nombre} (copia)`,
      version: 1,
      created_at: undefined,
      updated_at: undefined,
    });
    return this.repo.save(cloned);
  }

  /** Delete a template */
  async remove(id: string): Promise<void> {
    const tpl = await this.findOne(id);
    await this.repo.remove(tpl);
  }
}
