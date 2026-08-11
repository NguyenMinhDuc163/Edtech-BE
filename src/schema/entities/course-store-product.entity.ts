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
import { Course } from './course.entity';
import { IapPurchase } from './iap-purchase.entity';

export enum StorePlatform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  TEST_STORE = 'TEST_STORE',
}

export enum StoreProvider {
  APP_STORE = 'APP_STORE',
  PLAY_STORE = 'PLAY_STORE',
  TEST_STORE = 'TEST_STORE',
}

export enum StoreProductType {
  NON_CONSUMABLE = 'NON_CONSUMABLE',
}

@Entity('course_store_products')
@Index('IDX_course_store_product_platform_product', ['platform', 'product_id'], {
  unique: true,
})
@Index(
  'IDX_course_store_product_active_course_platform',
  ['course_id', 'platform'],
  { unique: true, where: '"is_active" = true' },
)
export class CourseStoreProduct {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Index('IDX_course_store_product_course')
  @Column({ type: 'bigint' })
  course_id!: string;

  @Column({ type: 'varchar', length: 20 })
  platform!: StorePlatform;

  @Column({ type: 'varchar', length: 30 })
  store!: StoreProvider;

  @Column({ type: 'varchar', length: 255 })
  product_id!: string;

  @Index('IDX_course_store_product_entitlement')
  @Column({ type: 'varchar', length: 255 })
  entitlement_id!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: StoreProductType.NON_CONSUMABLE,
  })
  product_type!: StoreProductType;

  @Column({ type: 'boolean', default: false })
  is_active!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @ManyToOne(() => Course, (course) => course.store_products, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'course_id',
    referencedColumnName: 'course_id',
    foreignKeyConstraintName: 'FK_course_store_products_course',
  })
  course!: Course;

  @OneToMany(() => IapPurchase, (purchase) => purchase.store_product)
  purchases!: IapPurchase[];
}
