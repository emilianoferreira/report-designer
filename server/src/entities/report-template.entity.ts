import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('report_templates')
export class ReportTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, c => c.report_templates)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ default: 1 })
  version: number;

  @Column({ length: 100, nullable: true })
  autor: string;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ length: 20, default: 'draft' })
  estado: string;

  @Column({ type: 'jsonb' })
  template_json: Record<string, any>;

  @Column({ nullable: true })
  based_on: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
