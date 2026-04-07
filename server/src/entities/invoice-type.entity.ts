import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('invoice_types')
export class InvoiceType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, c => c.invoice_types)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 100 })
  nombre: string;

  @Column({ length: 10, nullable: true })
  codigo: string;

  @Column({ default: true })
  opera_contado: boolean;

  @Column({ default: false })
  es_cfe: boolean;

  @Column({ default: true })
  activo: boolean;
}
