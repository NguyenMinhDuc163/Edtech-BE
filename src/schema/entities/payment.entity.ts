import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Course } from './course.entity';
import { Refund } from './refund.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',    // Đang chờ thanh toán
  SUCCESS = 'SUCCESS',    // Thành công
  FAILED = 'FAILED',      // Thất bại
  CANCELLED = 'CANCELLED' // Hủy bỏ
}

export enum PaymentMethod {
  VNPAY = 'VNPAY',
  MOMO = 'MOMO',
  ZALOPAY = 'ZALOPAY',
  APP_STORE = 'APP_STORE',
  PLAY_STORE = 'PLAY_STORE',
  FREE = 'FREE',
  ADMIN = 'ADMIN',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('increment', { name: 'payment_id', type: 'bigint' })
  payment_id!: string;

  @Index()
  @Column({ type: 'varchar', length: 50, unique: true })
  txn_ref!: string; // Mã giao dịch của hệ thống (unique)

  @Column({ type: 'bigint' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'bigint', nullable: true })
  course_id!: string | null;

  @ManyToOne(() => Course, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'course_id' })
  course?: Course | null;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string; // Số tiền (VNĐ)

  @Column({ type: 'varchar', length: 20, default: PaymentMethod.VNPAY })
  payment_method!: PaymentMethod;

  @Column({ type: 'varchar', length: 20, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transaction_no!: string | null; // Mã giao dịch của VNPay

  @Column({ type: 'varchar', length: 50, nullable: true })
  bank_code!: string | null; // Mã ngân hàng (NCB, VIETCOMBANK...)

  @Column({ type: 'varchar', length: 10, nullable: true })
  response_code!: string | null; // Mã phản hồi từ VNPay (00, 07, 24...)

  @Column({ type: 'varchar', length: 500, nullable: true })
  order_info!: string | null; // Thông tin đơn hàng

  @Column({ type: 'timestamptz', nullable: true })
  paid_at!: Date | null; // Thời gian thanh toán thành công

  @Column({ type: 'varchar', length: 14, nullable: true })
  vnp_create_date!: string | null; // vnp_CreateDate gốc (yyyyMMddHHmmss) để dùng cho refund

  @OneToMany(() => Refund, refund => refund.payment)
  refunds!: Refund[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
