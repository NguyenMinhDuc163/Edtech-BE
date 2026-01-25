import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany
} from 'typeorm';
import { User } from './user.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_sessions')
export class ChatSession {
    @PrimaryGeneratedColumn('increment', { name: 'session_id', type: 'bigint' })
    session_id!: string;

    @Column({ type: 'bigint', nullable: true })
    user_id!: string | null;

    @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'user_id' })
    user!: User | null;

    @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    last_active_at!: Date;

    @Column({ type: 'jsonb', default: {} })
    metadata!: Record<string, any>;

    @OneToMany(() => ChatMessage, (message) => message.session)
    messages!: ChatMessage[];
}
