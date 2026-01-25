import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

export enum ChatRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system'
}

@Entity('chat_messages')
export class ChatMessage {
    @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
    id!: string;

    @Column({ type: 'bigint' })
    session_id!: string;

    @ManyToOne(() => ChatSession, (session) => session.messages, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'session_id' })
    session!: ChatSession;

    @Column({
        type: 'varchar',
        length: 20,
        enum: ChatRole
    })
    role!: ChatRole;

    @Column({ type: 'text' })
    content!: string;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    created_at!: Date;

    @Column({ type: 'int', nullable: true })
    token_count!: number | null;
}
