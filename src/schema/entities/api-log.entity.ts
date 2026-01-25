import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('api_logs')
@Index(['method', 'endpoint']) 
@Index(['created_at']) 
@Index(['user_id']) 
export class ApiLog {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'text' })
  endpoint!: string; 

  @Column({ type: 'int', nullable: true })
  user_id?: number; 

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address?: string; 

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent?: string; 

  @Column({ type: 'json', nullable: true })
  request_headers?: any; 

  @Column({ type: 'json', nullable: true })
  request_body?: any; 

  @Column({ type: 'json', nullable: true })
  query_params?: any; 

  @Column({ type: 'int' })
  status_code!: number; 

  @Column({ type: 'json', nullable: true })
  response_body?: any; 

  @Column({ type: 'int' })
  response_time_ms!: number; 

  @Column({ type: 'text', nullable: true })
  error_message?: string; 

  @Column({ type: 'varchar', length: 50, nullable: true })
  error_code?: string; 

  @CreateDateColumn()
  created_at!: Date;
}
