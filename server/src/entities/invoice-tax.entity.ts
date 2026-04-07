import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_taxes')
export class InvoiceTax {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoice_id: string;

  @ManyToOne(() => Invoice, i => i.taxes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ length: 100 })
  nombre: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  tasa: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  valor: number;
}
