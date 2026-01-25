import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { QuestionBank } from './question-bank.entity';
import { Answer } from './answer.entity';

export enum CognitiveLevel {
  REMEMBER = 1,
  UNDERSTAND = 2,
  APPLY = 3,
  ANALYZE = 4,
}

@Entity('course_questions')
export class CourseQuestion {
  @PrimaryGeneratedColumn('increment', { name: 'question_id', type: 'bigint' })
  question_id!: string;

  @Column({ type: 'text' })
  question_text!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  created_at!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  question_type!: string | null;

  @Column({ type: 'integer', nullable: true })
  time_limit_sec!: number | null;

  @Index()
  @Column({ type: 'bigint', name: 'question_bank_id', nullable: true })
  question_bank_id!: string | null;

  @ManyToOne(() => QuestionBank, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_bank_id', referencedColumnName: 'question_bank_id' })
  questionBank!: QuestionBank;

  @OneToMany(() => Answer, (a) => a.question)
  answers!: Answer[];

  @Column({
    type: 'enum',
    enum: CognitiveLevel,
    default: CognitiveLevel.REMEMBER,
  })
  bloom_level!: CognitiveLevel;

  @Column({ type: 'float', nullable: true, default: 0 })
  irt_difficulty!: number | null;

  @Column({ type: 'float', nullable: true, default: 0 })
  irt_discrimination!: number | null;
}


