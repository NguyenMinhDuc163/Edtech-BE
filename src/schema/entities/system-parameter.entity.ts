import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('system_parameters')
export class SystemParameter {
  @PrimaryGeneratedColumn('increment', { name: 'param_id', type: 'bigint' })
  param_id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  param_key!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  param_value?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  function_name?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
