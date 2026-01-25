import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Unique, Index } from 'typeorm';
import { Course } from './course.entity';
import { User } from './user.entity';

@Entity('course_reviews')
@Unique(['course_id', 'user_id'])
export class CourseReview {
    @PrimaryGeneratedColumn('increment', { name: 'review_id', type: 'bigint' })
    review_id!: string;

    @Index()
    @Column({ type: 'bigint' })
    course_id!: string;

    @Index()
    @Column({ type: 'bigint' })
    user_id!: string;

    @Column({ type: 'integer' })
    rating!: number; // 1-5 sao

    @Column({ type: 'varchar', length: 255, nullable: true })
    title!: string | null;

    @Column({ type: 'text', nullable: true })
    content!: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;

    // Relations
    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'course_id', referencedColumnName: 'course_id' })
    course!: Course;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
    user!: User;
}
