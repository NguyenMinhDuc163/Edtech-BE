// src/schema/entities/pending-change.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Course } from './course.entity';

@Entity('pending_changes')
export class PendingChange {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id!: string;

  @Column({ name: 'courseCourseId', type: 'bigint', nullable: false })
  courseCourseId!: string;

  @ManyToOne(() => Course, (course) => course.pendingChanges, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'courseCourseId' })
  course!: Course;

  @Column({ name: 'submittedById', type: 'bigint', nullable: false })
  submittedById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'submittedById' })
  submittedBy!: User;

  @Column({ type: 'jsonb' })
  changeData!: any;

  @Column({ default: 'pending' })
  status!: 'draft' | 'pending' | 'approved' | 'rejected';

  @Column({ type: 'text', nullable: true })
  adminComment!: string | null;

  @Column({ type: 'int', default: 0 })
  riskScore!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

}