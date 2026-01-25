import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, OneToMany } from 'typeorm';
import { QuestionBank } from './question-bank.entity';
import { User } from './user.entity';
import { QuizAttempt } from './quiz-attempt.entity';
import { QuizResponse } from './quiz-response.entity';

export enum ResultStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED'
}

@Entity('quiz_results')
export class QuizResult {
  @PrimaryGeneratedColumn('increment', { name: 'result_id', type: 'bigint' })
  result_id!: string;

  @Column({ type: 'integer', default: 1 })
  attempt_number!: number; // Đổi tên từ attempts

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  score!: string;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at!: Date | null;

  @Index()
  @Column({ type: 'bigint', nullable: true, name: 'question_bank_id' })
  question_bank_id!: string | null;

  @ManyToOne(() => QuestionBank, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'question_bank_id', referencedColumnName: 'question_bank_id' })
  questionBank?: QuestionBank | null;

  @Index()
  @Column({ type: 'bigint', name: 'student_id' })
  student_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id', referencedColumnName: 'id' })
  student!: User;

  // Các trường mới
  @Index()
  @Column({ type: 'bigint', nullable: true, name: 'attempt_id' })
  attempt_id!: string | null;

  @ManyToOne(() => QuizAttempt, (qa) => qa.results, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attempt_id', referencedColumnName: 'attempt_id' })
  attempt?: QuizAttempt | null;

  @Column({ type: 'enum', enum: ResultStatus, default: ResultStatus.IN_PROGRESS })
  status!: ResultStatus;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  started_at!: Date;

  @Column({ type: 'integer', default: 0 })
  time_spent_minutes!: number;

  @Column({ type: 'boolean', default: false })
  is_passed!: boolean;

  @OneToMany(() => QuizResponse, (qr) => qr.result)
  responses!: QuizResponse[];
}


