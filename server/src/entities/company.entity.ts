import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Branch } from './branch.entity';
import { Contact } from './contact.entity';
import { InvoiceType } from './invoice-type.entity';
import { Article } from './article.entity';
import { Invoice } from './invoice.entity';
import { ReportTemplate } from './report-template.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ length: 200, nullable: true })
  nombre_comercial: string;

  @Column({ length: 30 })
  rut: string;

  @Column({ length: 300, nullable: true })
  direccion: string;

  @Column({ length: 100, nullable: true })
  ciudad: string;

  @Column({ length: 50, nullable: true })
  telefono: string;

  @Column({ length: 200, nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  logo_url: string;

  @Column({ type: 'jsonb', default: {} })
  parametros: Record<string, any>;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => Branch, b => b.company)
  branches: Branch[];

  @OneToMany(() => Contact, c => c.company)
  contacts: Contact[];

  @OneToMany(() => InvoiceType, it => it.company)
  invoice_types: InvoiceType[];

  @OneToMany(() => Article, a => a.company)
  articles: Article[];

  @OneToMany(() => Invoice, i => i.company)
  invoices: Invoice[];

  @OneToMany(() => ReportTemplate, rt => rt.company)
  report_templates: ReportTemplate[];
}
