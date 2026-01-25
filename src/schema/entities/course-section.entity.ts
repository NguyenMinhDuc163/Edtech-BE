import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Course } from './course.entity';
import { CourseContent } from './course-content.entity';

@Entity('course_sections')
export class CourseSection {
  @PrimaryGeneratedColumn('increment', { name: 'section_id', type: 'bigint' })
  section_id!: string;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'int', default: 1 })
  order_index!: number;

    @Column({ type: 'boolean', default: true })
    is_active!: boolean;

    @Column({ type: 'varchar', length: 1, default: 'N' })
    is_preview!: string; // Y/N

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @Column({ type: 'bigint', name: 'course_id' })
  course_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id', referencedColumnName: 'course_id' })
  course!: Course;

  @OneToMany(() => CourseContent, (content) => content.section, { cascade: true })
  contents!: CourseContent[];
}
