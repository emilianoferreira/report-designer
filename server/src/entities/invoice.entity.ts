import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Company } from './company.entity';
import { Branch } from './branch.entity';
import { InvoiceType } from './invoice-type.entity';
import { Contact } from './contact.entity';
import { Currency } from './currency.entity';
import { InvoiceLine } from './invoice-line.entity';
import { InvoiceTax } from './invoice-tax.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @Column({ nullable: true })
  branch_id: string;

  @Column()
  type_id: string;

  @Column({ nullable: true })
  contact_id: string;

  @Column()
  currency_id: string;

  @ManyToOne(() => Company, c => c.invoices)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(() => InvoiceType)
  @JoinColumn({ name: 'type_id' })
  invoice_type: InvoiceType;

  @ManyToOne(() => Contact)
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency_id' })
  currency: Currency;

  @Column({ length: 5, default: 'A' })
  serie: string;

  @Column()
  numero: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fecha: Date;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, default: 1 })
  tipo_cambio: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  porcentaje_desc_global: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  monto_dto_global: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  redondeo: number;

  @Column({ default: true })
  is_imp_incluidos: boolean;

  @Column({ default: true })
  is_consumo_final: boolean;

  @Column({ type: 'text', default: '' })
  comentario: string;

  @Column({ length: 300, nullable: true })
  direccion_factura: string;

  // CFE
  @Column({ length: 50, nullable: true })
  cae_identificador: string;

  @Column({ length: 20, nullable: true })
  cae_desde: string;

  @Column({ length: 20, nullable: true })
  cae_hasta: string;

  @Column({ type: 'date', nullable: true })
  cae_fecha_vto: Date;

  @Column({ length: 20, nullable: true })
  cfe_cod_seguridad: string;

  @Column({ type: 'text', nullable: true })
  cfe_adenda: string;

  @Column({ length: 20, default: 'emitido' })
  estado: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => InvoiceLine, l => l.invoice, { cascade: true })
  lines: InvoiceLine[];

  @OneToMany(() => InvoiceTax, t => t.invoice, { cascade: true })
  taxes: InvoiceTax[];
}
