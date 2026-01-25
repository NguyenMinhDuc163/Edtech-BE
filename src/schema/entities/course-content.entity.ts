import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Course } from './course.entity';
import { CourseSection } from './course-section.entity';
import { ContentFile } from './content-file.entity';
import { ContentRelationship } from './content_relationships.entity';
import { UserContentMastery } from './user-content-mastery.entity';

@Entity('course_contents')
export class CourseContent {
  @PrimaryGeneratedColumn('increment', { name: 'content_id', type: 'bigint' })
  content_id!: string;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 1, default: 'N' })
  is_preview!: string; // Y/N

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  created_at!: Date;

  @Column({ type: 'bigint', name: 'courses_id' })
  courses_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courses_id', referencedColumnName: 'course_id' })
  course!: Course;

  @Column({ type: 'bigint', name: 'section_id', nullable: true })
  section_id?: string | null;

  @ManyToOne(() => CourseSection, (section) => section.contents, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'section_id', referencedColumnName: 'section_id' })
  section?: CourseSection | null;

  @OneToMany(() => ContentFile, (file) => file.content, { cascade: true })
  files!: ContentFile[];

  @OneToMany(() => ContentRelationship, (r) => r.parentContent)
  parentRelations!: ContentRelationship[];

  @OneToMany(() => ContentRelationship, (r) => r.childContent)
  childRelations!: ContentRelationship[];

  @OneToMany(() => UserContentMastery, (m) => m.content)
  masteryRecords!: UserContentMastery[];
}


