import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { CourseSection } from './course-section.entity';
import { CourseApproval } from './course-approval.entity';
import { PendingChange } from './pending-change.entity';
import { CourseReview } from './course-review.entity';
import { CourseRegistration } from './course-registration.entity';
import { CourseStoreProduct } from './course-store-product.entity';

export enum CourseVisibility {
    PRIVATE = 'PRIVATE',
    PUBLIC = 'PUBLIC',
}

export enum CourseStatus {
    DRAFT = 'DRAFT',
    APPROVED = 'APPROVED',
    PENDING = 'PENDING',
    REJECTED = 'REJECTED',
}

export enum CourseCategory {
    PROGRAMMING_FOUNDATION = 'PROGRAMMING_FOUNDATION',
    WEB_DEVELOPMENT = 'WEB_DEVELOPMENT',
    MOBILE_DEVELOPMENT = 'MOBILE_DEVELOPMENT',
    BACKEND_DEVELOPMENT = 'BACKEND_DEVELOPMENT',
    FRONTEND_DEVELOPMENT = 'FRONTEND_DEVELOPMENT',
    DATA_SCIENCE = 'DATA_SCIENCE',
    AI_MACHINE_LEARNING = 'AI_MACHINE_LEARNING',
    DEVOPS_CLOUD = 'DEVOPS_CLOUD',
    DATABASE = 'DATABASE',
    SOFTWARE_TESTING = 'SOFTWARE_TESTING',
    CYBER_SECURITY = 'CYBER_SECURITY',
    CAREER_SOFT_SKILLS = 'CAREER_SOFT_SKILLS',
}

@Entity('courses')
export class Course {
    @PrimaryGeneratedColumn('increment', { name: 'course_id', type: 'bigint' })
    course_id!: string;

    @Column({ type: 'varchar', length: 512 })
    title!: string;

    @Column({
        type: 'enum',
        enum: CourseCategory,
    })
    category!: CourseCategory;

    @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
    price!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @Column({ type: 'bigint', nullable: true })
    user_id!: string | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'user_id' })
    owner?: User | null;

    @Column({ type: 'varchar', length: 10, default: 'VND' })
    currency!: string;

    @Column({ type: 'varchar', length: 20, default: CourseVisibility.PRIVATE })
    visibility!: CourseVisibility;

    @Column({ type: 'varchar', length: 20, default: CourseStatus.DRAFT })
    status!: CourseStatus;

    @Column({ type: 'varchar', length: 1, default: 'N' })
    is_preview!: string; // Y/N

    @Column({ type: 'varchar', length: 100, nullable: true })
    course_duration!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    teacher!: string | null;

    @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
    discount_amount!: string;

    @Column({ type: 'text', nullable: true })
    course_description!: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    thumbnail_url!: string | null;

    @Column({ type: 'boolean', default: true })
    is_paid!: boolean;

    @Column({ type: 'boolean', default: false })
    mobile_iap_enabled!: boolean;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;

    @OneToMany(() => CourseSection, (section) => section.course, { cascade: true })
    sections!: CourseSection[];

    @OneToMany(() => CourseApproval, (approval) => approval.course)
    approvals!: CourseApproval[];

    @OneToMany(() => PendingChange, (pc) => pc.course)
    pendingChanges!: PendingChange[];

    @OneToMany(() => CourseReview, (review) => review.course)
    reviews!: CourseReview[];

    @OneToMany(() => CourseRegistration, (reg) => reg.course)
    registrations!: CourseRegistration[];

    @OneToMany(() => CourseStoreProduct, (product) => product.course)
    store_products!: CourseStoreProduct[];
}
