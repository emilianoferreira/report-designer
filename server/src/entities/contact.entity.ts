import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, c => c.contacts)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 200 })
  guardar_como: string;

  @Column({ length: 30, nullable: true })
  rut: string;

  @Column({ length: 300, nullable: true })
  direccion: string;

  @Column({ length: 100, nullable: true })
  ciudad: string;

  @Column({ length: 50, nullable: true })
  telefono: string;

  @Column({ length: 200, nullable: true })
  email: string;

  @Column({ length: 20, default: 'cliente' })
  tipo: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
