import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum WebhookProcessingStatus {
  RECEIVED = 'RECEIVED',
  PROCESSED = 'PROCESSED',
  IGNORED = 'IGNORED',
  FAILED = 'FAILED',
}

@Entity('revenuecat_webhook_events')
export class RevenueCatWebhookEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  event_id!: string;

  @Column({ type: 'varchar', length: 50 })
  event_type!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  environment!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  app_id!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: WebhookProcessingStatus.RECEIVED,
  })
  processing_status!: WebhookProcessingStatus;

  @Column({ type: 'text', nullable: true })
  failure_reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  received_at!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at!: Date | null;
}
