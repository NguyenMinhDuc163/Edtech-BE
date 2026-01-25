import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { CourseQuestion } from './course-question.entity';

@Entity('answers')
export class Answer {
  @PrimaryGeneratedColumn('increment', { name: 'answer_id', type: 'bigint' })
  answer_id!: string;

  @Index()
  @Column({ type: 'bigint', name: 'question_id' })
  question_id!: string;

  @ManyToOne(() => CourseQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id', referencedColumnName: 'question_id' })
  question!: CourseQuestion;

  @Column({ type: 'varchar', length: 255 })
  content!: string;

  @Column({ type: 'boolean', default: false })
  is_correct!: boolean;
}


