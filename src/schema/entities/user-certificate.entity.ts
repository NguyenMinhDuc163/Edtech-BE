import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_certificates')
export class UserCertificate {
    @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
    id!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @Column({ type: 'varchar', length: 255 })
    title!: string;

    @Column({ type: 'varchar', length: 1000, nullable: true })
    description!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    issued_by!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    issued_at!: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    expires_at!: Date | null;

    @Column({ type: 'varchar', length: 1000, nullable: true })
    file_url!: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;
}


