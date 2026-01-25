import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { QuestionBank } from './question-bank.entity';
import { User } from './user.entity';
import { QuizResult } from './quiz-result.entity';

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED'
}

@Entity('quiz_attempts')
export class QuizAttempt {
  @PrimaryGeneratedColumn('increment', { name: 'attempt_id', type: 'bigint' })
  attempt_id!: string;

  @Index()
  @Column({ type: 'bigint', name: 'question_bank_id' })
  question_bank_id!: string;

  @ManyToOne(() => QuestionBank, (qb) => qb.attempts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_bank_id', referencedColumnName: 'question_bank_id' })
  questionBank!: QuestionBank;

  @Index()
  @Column({ type: 'bigint', name: 'student_id' })
  student_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id', referencedColumnName: 'id' })
  student!: User;

  @Column({ type: 'integer' })
  attempt_number!: number;

  @Column({ type: 'enum', enum: AttemptStatus, default: AttemptStatus.IN_PROGRESS })
  status!: AttemptStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  started_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at!: Date | null;

  @Column({ type: 'integer', default: 0 })
  time_spent_minutes!: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  score!: string;

  @Column({ type: 'boolean', default: false })
  is_passed!: boolean;

  @OneToMany(() => QuizResult, (qr) => qr.attempt)
  results!: QuizResult[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
