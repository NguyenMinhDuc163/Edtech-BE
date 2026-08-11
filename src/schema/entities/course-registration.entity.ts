import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { User } from './user.entity';
import { Course } from './course.entity';
import { IapPurchase } from './iap-purchase.entity';

export enum CourseAccessSource {
  FREE = 'FREE',
  VNPAY = 'VNPAY',
  APP_STORE = 'APP_STORE',
  PLAY_STORE = 'PLAY_STORE',
  ADMIN = 'ADMIN',
}

@Entity('course_registrations')
@Unique(['user_id', 'course_id'])
export class CourseRegistration {
  @PrimaryGeneratedColumn('increment', { name: 'registration_id', type: 'bigint' })
  registration_id!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  registered_at!: Date;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  progress!: number; // 0..100

  @Column({ type: 'varchar', length: 4, default: 'PAID' })
  payment_status!: string; // PAID, PEND, FAIL, REFD

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  amount_paid!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  payment_method!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transaction_id!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  access_source!: CourseAccessSource | null;

  @Column({ type: 'bigint', nullable: true })
  iap_purchase_id!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  purchase_date!: Date;


  @Index()
  @Column({ type: 'bigint' })
  user_id!: string;

  @Index()
  @Column({ type: 'bigint' })
  course_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user!: User;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id', referencedColumnName: 'course_id' })
  course!: Course;

  @ManyToOne(() => IapPurchase, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({
        name: 'iap_purchase_id',
        referencedColumnName: 'id',
        foreignKeyConstraintName: 'FK_course_registrations_iap_purchase',
    })
  iap_purchase?: IapPurchase | null;
}
