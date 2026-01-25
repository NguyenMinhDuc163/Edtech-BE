import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { CourseContent } from './course-content.entity';

@Entity('transcript_chunks')
export class TranscriptChunk {
    @PrimaryGeneratedColumn('increment', { name: 'chunk_id', type: 'bigint' })
    chunk_id!: string;

    @Column({ type: 'bigint', name: 'content_id' })
    content_id!: string;

    @ManyToOne(() => CourseContent, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'content_id', referencedColumnName: 'content_id' })
    content!: CourseContent;

    @Column({ type: 'bigint', nullable: true })
    course_id?: string | null;

    @Column({ type: 'text' })
    chunk_text!: string;

    @Column({ type: 'int' })
    chunk_index!: number;

    @Column({ type: 'float', nullable: true })
    start_time?: number | null;

    @Column({ type: 'float', nullable: true })
    end_time?: number | null;

    @Column({ type: 'vector', length: 768 })
    embedding!: number[];

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @Column({ type: 'tsvector', nullable: true })
    chunk_text_tsv?: any;
}
