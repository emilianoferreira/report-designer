import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Invoice } from '../../entities';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly repo: Repository<Invoice>,
    private readonly dataSource: DataSource,
  ) {}

  /** List all invoices for a company (summary) */
  async findAll(companyId: string): Promise<any[]> {
    return this.repo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.invoice_type', 'it')
      .leftJoinAndSelect('i.contact', 'c')
      .leftJoinAndSelect('i.currency', 'cur')
      .where('i.company_id = :companyId', { companyId })
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
      `SELECT build_invoice_data($1) as data`,
      [invoiceId],
    );

    if (!result?.length || !result[0].data) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    const data = result[0].data;
    if (data.error) {
      throw new NotFoundException(data.error);
    }

    return data;
  }
}
