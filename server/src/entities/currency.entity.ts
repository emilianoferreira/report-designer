import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('currencies')
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 3, unique: true })
  iso4217: string;

  @Column({ length: 5 })
  simbolo: string;

  @Column({ length: 50 })
  nombre: string;

  @Column({ default: 2 })
  decimales: number;
}
