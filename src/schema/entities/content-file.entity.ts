import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { CourseContent } from './course-content.entity';

export enum FileType {
  VIDEO = 'video',
  PDF = 'pdf',
  TEXT = 'text',
  QUIZ = 'quiz',
  IMAGE = 'image',
  AUDIO = 'audio',
  DOCUMENT = 'document'
}

export enum ChunkStatus {
  NEW = 'NEW',
  PEND = 'PEND',
  SUCC = 'SUCC',
  FAIL = 'FAIL'
}

@Entity('content_files')
export class ContentFile {
  @PrimaryGeneratedColumn('increment', { name: 'file_id', type: 'bigint' })
  file_id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 1024 })
  url!: string;

  @Column({ type: 'varchar', length: 50 })
  file_type!: FileType;

  @Column({ type: 'bigint', nullable: true })
  file_size?: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mime_type?: string | null;

  @Column({ type: 'int', default: 1 })
  order_index!: number;

    @Column({ type: 'boolean', default: true })
    is_active!: boolean;

    @Column({ type: 'varchar', length: 1, default: 'N' })
    is_preview!: string; // Y/N

    @Column({ type: 'varchar', length: 10, default: ChunkStatus.NEW })
    status_chunks!: ChunkStatus;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

  @Column({ type: 'bigint', name: 'content_id' })
  content_id!: string;

  @ManyToOne(() => CourseContent, (content) => content.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id', referencedColumnName: 'content_id' })
  content!: CourseContent;
}
