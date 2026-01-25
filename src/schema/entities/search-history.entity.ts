import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('search_history')
export class SearchHistory {
  @PrimaryGeneratedColumn('increment', { name: 'search_id', type: 'bigint' })
  search_id!: string;

  @Column({ type: 'varchar', length: 255 })
  keyword!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @Column({ type: 'bigint', nullable: false })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
