import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany
} from 'typeorm';
import { UserRole } from './user-role.entity';
import { Exclude } from 'class-transformer';
import * as bcrypt from "bcrypt";
import { PendingChange } from './pending-change.entity';
import { UserContentMastery } from './user-content-mastery.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
    id!: string;

    @Column({ type: "varchar", length: 100 })
    username!: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    full_name!: string | null;

    @Column({ type: "varchar", length: 255, unique: true })
    email!: string;

    @Exclude()
    @Column({ type: "varchar", length: 255 })
    password!: string;

    @Column({ type: "boolean", default: true })
    is_active!: boolean;

    @Column({ type: "varchar", length: 1, default: "Y" })
    is_ads!: string;

    @Column({ type: "varchar", length: 500, nullable: true })
    avatar_url!: string | null;

    @Column({ type: "varchar", length: 20, nullable: true })
    phone!: string | null;

    @Column({ type: "varchar", length: 50, nullable: true })
    grade!: string | null;

    @Column({ type: "varchar", length: 100, nullable: true })
    subject_specialty!: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    created_at!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updated_at!: Date;
    
    @Column({ type: 'int', nullable: true, default: null })
    trustScore?: number | null;

    @Exclude()
    @OneToMany(() => UserRole, (ur) => ur.user, { cascade: true })
    roles!: UserRole[];

    @OneToMany(() => PendingChange, (pc) => pc.submittedBy)
    pendingChanges!: PendingChange[];


    async setPassword(plain: string) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(plain, salt);
    }

    async comparePassword(plain: string) {
        if (!this.password) return false;
        return bcrypt.compare(plain, this.password);
    }

    @OneToMany(() => UserContentMastery, (m) => m.user)
    masteryRecords!: UserContentMastery[];
}
