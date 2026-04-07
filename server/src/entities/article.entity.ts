import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, c => c.articles)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 50 })
  codigo: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  precio: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  precio_neto: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 22.0 })
  iva_tasa: number;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
