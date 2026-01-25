import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { UserRole } from "./user-role.entity";

export enum SystemRole {
    STUDENT = "student",
    TEACHER = "teacher",
    ADMIN = "admin",
    GUEST = "guest",
}

@Entity("roles")
export class Role {
    @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
    id!: string;

    @Column({
        type: "enum",
        enum: SystemRole,
        unique: true,
        default: SystemRole.STUDENT,
    })
    name!: SystemRole;

    @OneToMany(() => UserRole, (ur) => ur.role)
    userRoles!: UserRole[];
}
