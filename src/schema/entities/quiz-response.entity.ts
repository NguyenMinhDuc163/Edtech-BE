import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { QuizResult } from './quiz-result.entity';
import { CourseQuestion } from './course-question.entity';
import { Answer } from './answer.entity';

@Entity('quiz_responses')
export class QuizResponse {
  @PrimaryGeneratedColumn('increment', { name: 'response_id', type: 'bigint' })
  response_id!: string;

  @Index()
  @Column({ type: 'bigint', name: 'result_id' })
  result_id!: string;

  @ManyToOne(() => QuizResult, (qr) => qr.responses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'result_id', referencedColumnName: 'result_id' })
  result!: QuizResult;

  @Index()
  @Column({ type: 'bigint', name: 'question_id' })
  question_id!: string;

  @ManyToOne(() => CourseQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id', referencedColumnName: 'question_id' })
  question!: CourseQuestion;

  @Index()
  @Column({ type: 'bigint', nullable: true, name: 'selected_answer_id' })
  selected_answer_id!: string | null;

  @ManyToOne(() => Answer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'selected_answer_id', referencedColumnName: 'answer_id' })
  selectedAnswer?: Answer | null;

  @Column({ type: 'text', nullable: true })
  text_answer!: string | null; // Cho câu hỏi tự luận

  @Column({ type: 'boolean', nullable: true })
  is_correct!: boolean | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  points_earned!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  answered_at!: Date;
}
