import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    Unique,
    CreateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Role } from "./role.entity";

@Entity("user_roles")
@Unique(["user", "role"])
export class UserRole {
    @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
    id!: string;

    @ManyToOne(() => User, (u) => u.roles, { onDelete: "CASCADE" })
    user!: User;

    @ManyToOne(() => Role, (r) => r.userRoles, { onDelete: "RESTRICT" })
    role!: Role;

    @Column({ type: "varchar", nullable: true })
    assigned_by?: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    assigned_at!: Date;
}
