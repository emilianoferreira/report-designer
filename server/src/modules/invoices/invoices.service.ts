import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { companyId } from '../../auth/auth.module';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Invoice } from '../../entities';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    @InjectRepository(Invoice)
    private readonly repo: Repository<Invoice>,
    private readonly dataSource: DataSource,
  ) {}

  /** List all invoices for a company (summary) */
  async findAll(companyId: string): Promise<any[]> {
    if (this.company !== companyIdCanonical(companyId)) throw new ForbiddenException();
    return this.repo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.invoice_type', 'it')
      .leftJoinAndSelect('i.contact', 'c')
      .leftJoinAndSelect('i.currency', 'cur')
      .where('i.company_id = :companyId', { companyId })
      .andWhere('(c.company_id IS NULL OR c.company_id=i.company_id) AND it.company_id=i.company_id')
      .orderBy('i.fecha', 'DESC')
      .select([
        'i.id', 'i.serie', 'i.numero', 'i.fecha', 'i.total', 'i.estado',
        'it.nombre', 'it.codigo',
        'c.guardar_como',
        'cur.iso4217', 'cur.simbolo',
      ])
      .getMany();
  }

  /** Get full InvoiceData JSON for preview rendering using the DB function */
  async getInvoiceData(invoiceId: string): Promise<Record<string, any>> {
    const result = await this.dataSource.query(
      `SELECT build_invoice_data(i.id) as data FROM invoices i WHERE i.id=$1 AND i.company_id=$2
        AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id=i.contact_id AND c.company_id<>i.company_id)
        AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.id=i.branch_id AND b.company_id<>i.company_id)
        AND NOT EXISTS (SELECT 1 FROM invoice_types t WHERE t.id=i.type_id AND t.company_id<>i.company_id)`,
      [invoiceId, this.company],
    );

    if (!result?.length || !result[0].data) {
      throw new NotFoundException('Invoice not found');
    }

    const data = result[0].data;
    if (data.error) {
      throw new NotFoundException(data.error);
    }

    return data;
  }
  get company(): string { return this.request.auth.company_id; }
}
const companyIdCanonical = companyId;
