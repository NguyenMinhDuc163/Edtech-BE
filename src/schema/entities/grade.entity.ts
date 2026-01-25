import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { Course } from './course.entity';
import { User } from './user.entity';

@Entity('grades')
@Unique(['course_id', 'student_id'])
export class Grade {
  @PrimaryGeneratedColumn('increment', { name: 'grade_id', type: 'bigint' })
  grade_id!: string;

  @Index()
  @Column({ type: 'bigint' })
  course_id!: string;

  @Index()
  @Column({ type: 'bigint' })
  student_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id', referencedColumnName: 'course_id' })
  course!: Course;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id', referencedColumnName: 'id' })
  student!: User;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  final_score!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  progress!: string;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, default: 0 })
  total_hours!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  updated_at!: Date;
}


