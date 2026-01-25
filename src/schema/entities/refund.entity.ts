import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Payment } from './payment.entity';
import { User } from './user.entity';

export enum RefundStatus {
  PEND = 'PEND',
  PROC = 'PROC',
  SUCC = 'SUCC',
  FAIL = 'FAIL',
  REJECT = 'REJECT'
}

export enum RefundTransactionType {
  FULL = '02',
  PARTIAL = '03'
}

@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn('increment', { name: 'refund_id', type: 'bigint' })
  refund_id!: string;

  @Index()
  @Column({ type: 'bigint' })
  payment_id!: string;

  @ManyToOne(() => Payment, payment => payment.refunds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment;

  @Index()
  @Column({ type: 'varchar', length: 32, unique: true })
  vnp_request_id!: string;

  @Column({ type: 'varchar', length: 100 })
  vnp_txn_ref!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 2 })
  transaction_type!: RefundTransactionType;

  @Column({ type: 'varchar', length: 500 })
  order_info!: string;

  @Column({ type: 'text', default: '' })
  reason!: string;

  @Column({ type: 'bigint' })
  created_by!: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: User;

  @Column({ type: 'varchar', length: 45 })
  ip_addr!: string;

  @Column({ type: 'varchar', length: 14 })
  vnp_transaction_date!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  vnp_response_id!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  response_code!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  response_message!: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  vnp_transaction_no!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  transaction_status!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bank_code!: string | null;

  @Column({ type: 'varchar', length: 20, default: RefundStatus.PEND })
  status!: RefundStatus;

  @Column({ type: 'text', nullable: true })
  reject_reason!: string | null;

  @Column({ type: 'bigint', nullable: true })
  approved_by!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver!: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  refunded_at!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
