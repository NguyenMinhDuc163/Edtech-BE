import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  UpdateDateColumn,
  CreateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { CourseContent } from "./course-content.entity";

export enum MasteryStatus {
  LOCKED = "LOCKED",
  UNLOCKED = "UNLOCKED",
  IN_PROGRESS = "IN_PROGRESS",
  MASTERED = "MASTERED",
}

@Entity("user_content_mastery")
@Index(["user_id", "content_id"], { unique: true })
export class UserContentMastery {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Index()
  @Column({ type: "bigint" })
  user_id!: string;

  @ManyToOne(() => User, (u) => u.masteryRecords, {
    onDelete: "CASCADE",
  })
  @JoinColumn({
    name: "user_id",
    referencedColumnName: "id",
  })
  user!: User;

  @Index()
  @Column({ type: "bigint" })
  content_id!: string;

  @ManyToOne(() => CourseContent, (c) => c.masteryRecords, {
    onDelete: "CASCADE",
  })
  @JoinColumn({
    name: "content_id",
    referencedColumnName: "content_id",
  })
  content!: CourseContent;

  @Column({ type: "float", default: 0 })
  theta!: number;

  @Column({ type: "float", default: 0.2 })
  certainty!: number;

  @Column({
    type: "enum",
    enum: MasteryStatus,
    default: MasteryStatus.UNLOCKED,
  })
  status!: MasteryStatus;

  @Column({ type: "boolean", default: false })
  is_completed!: boolean;

  @Column({ type: "float", default: 0 })
  last_playback_position!: number;

  @Column({ type: "integer", default: 0 })
  total_time_spent!: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  progress_percent!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  last_updated!: Date;
}
