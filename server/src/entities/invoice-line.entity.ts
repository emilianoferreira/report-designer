import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_lines')
export class InvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoice_id: string;

  @ManyToOne(() => Invoice, i => i.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ nullable: true })
  article_id: string;

  @Column({ default: 1 })
  linea_nro: number;

  @Column({ length: 50, nullable: true })
  articulo_codigo: string;

  @Column({ length: 200, nullable: true })
  articulo_nombre: string;

  @Column({ type: 'numeric', precision: 15, scale: 4, default: 1 })
  cantidad: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  precio_unitario: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  precio_unitario_neto: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  descuento: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 22.0 })
  iva_tasa: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
