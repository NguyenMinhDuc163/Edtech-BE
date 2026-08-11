import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Course } from './course.entity';
import {
  CourseStoreProduct,
  StoreProvider,
} from './course-store-product.entity';
import { CourseRegistration } from './course-registration.entity';

export enum IapPurchaseStatus {
  ACTIVE = 'ACTIVE',
  REFUNDED = 'REFUNDED',
  REVOKED = 'REVOKED',
}

export enum IapEnvironment {
  SANDBOX = 'SANDBOX',
  PRODUCTION = 'PRODUCTION',
}

@Entity('iap_purchases')
@Index('IDX_iap_purchase_transaction', ['store', 'environment', 'transaction_id'], {
  unique: true,
})
@Index('IDX_iap_purchase_user_course_status', ['user_id', 'course_id', 'status'])
export class IapPurchase {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ type: 'bigint' })
  user_id!: string;

  @Column({ type: 'bigint' })
  course_id!: string;

  @Column({ type: 'bigint' })
  store_product_id!: string;

  @Index('IDX_iap_purchase_rc_user')
  @Column({ type: 'uuid' })
  revenuecat_app_user_id!: string;

  @Column({ type: 'varchar', length: 30 })
  store!: StoreProvider;

  @Column({ type: 'varchar', length: 20 })
  environment!: IapEnvironment;

  @Column({ type: 'varchar', length: 255 })
  product_id!: string;

  @Column({ type: 'varchar', length: 255 })
  entitlement_id!: string;

  @Column({ type: 'varchar', length: 255 })
  transaction_id!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  original_transaction_id!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: IapPurchaseStatus.ACTIVE,
  })
  status!: IapPurchaseStatus;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  price!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country_code!: string | null;

  @Column({ type: 'timestamptz' })
  purchased_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  raw_last_event!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'FK_iap_purchases_user',
  })
  user!: User;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'course_id',
    referencedColumnName: 'course_id',
    foreignKeyConstraintName: 'FK_iap_purchases_course',
  })
  course!: Course;

  @ManyToOne(() => CourseStoreProduct, (product) => product.purchases, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'store_product_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'FK_iap_purchases_store_product',
  })
  store_product!: CourseStoreProduct;

  @OneToMany(() => CourseRegistration, (registration) => registration.iap_purchase)
  registrations!: CourseRegistration[];
}
