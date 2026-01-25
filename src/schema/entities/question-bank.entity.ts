import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CourseContent } from './course-content.entity';
import { CourseQuestion } from './course-question.entity';
import { User } from './user.entity';
import { QuizAttempt } from './quiz-attempt.entity';

export enum QuizType {
  ASSIGNMENT = 'ASSIGNMENT',
  EXAM = 'EXAM',
  PRACTICE = 'PRACTICE'
}

export enum QuizStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CLOSED = 'CLOSED'
}

export enum QuestionType {
  TN = 'TN',      // Trắc nghiệm
  YN = 'YN',      // Đúng/Sai  
  TL = 'TL',      // Tự luận
  FILL = 'FILL'   // Điền từ
}

@Entity('question_bank')
export class QuestionBank {
  @PrimaryGeneratedColumn('increment', { name: 'question_bank_id', type: 'bigint' })
  question_bank_id!: string;

  // Quiz thông tin
  @Column({ type: 'varchar', length: 255, nullable: true })
  quiz_title!: string | null;

  @Column({ type: 'text', nullable: true })
  quiz_description!: string | null;

  @Index()
  @Column({ type: 'bigint', nullable: true, name: 'teacher_id' })
  teacher_id!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_id', referencedColumnName: 'id' })
  teacher?: User | null;

  // Quiz cấu hình
  @Column({ type: 'enum', enum: QuizType, default: QuizType.ASSIGNMENT })
  quiz_type!: QuizType;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 50.00 })
  passing_score!: string;

  @Column({ type: 'integer', default: 1 })
  max_attempts!: number;

  @Column({ type: 'boolean', default: false })
  is_random_order!: boolean;

  @Column({ type: 'boolean', default: false })
  is_shuffle_answers!: boolean;

  @Column({ type: 'enum', enum: QuizStatus, default: QuizStatus.DRAFT })
  status!: QuizStatus;

  @Column({ type: 'timestamptz', nullable: true })
  start_time!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  end_time!: Date | null;

  @Column({ type: 'boolean', default: false })
  is_required!: boolean;

  @Column({ type: 'enum', enum: QuestionType, default: QuestionType.TN })
  question_type!: QuestionType;

  // Các trường cũ (giữ lại cho tương thích)
  @Column({ type: 'varchar', length: 255, nullable: true })
  difficulty!: string | null;

  @Column({ type: 'text', nullable: true })
  question_text!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tags!: string | null;

  @Column({ type: 'integer', nullable: true })
  time_limit_sec!: number | null;

  @Index()
  @Column({ type: 'bigint', nullable: true, name: 'course_content' })
  course_content!: string | null;

  @ManyToOne(() => CourseContent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'course_content', referencedColumnName: 'content_id' })
  content?: CourseContent | null;

  @OneToMany(() => CourseQuestion, (cq) => cq.questionBank)
  courseQuestions!: CourseQuestion[];

  @OneToMany(() => QuizAttempt, (qa) => qa.questionBank)
  attempts!: QuizAttempt[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}


