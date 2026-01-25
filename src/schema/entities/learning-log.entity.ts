import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Course } from "./course.entity";
import { CourseContent } from "./course-content.entity";

export enum LearningAction {
  VIDEO_START = "VIDEO_START",
  VIDEO_WATCHING = "VIDEO_WATCHING",
  VIDEO_PAUSE = "VIDEO_PAUSE",
  VIDEO_COMPLETE = "VIDEO_COMPLETE",
  QUIZ_ATTEMPT = "QUIZ_ATTEMPT",
  MATERIAL_DOWNLOAD = "MATERIAL_DOWNLOAD",
}

@Entity("learning_logs")
export class LearningLog {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  log_id!: string;

  @Index()
  @Column({ type: "bigint" })
  student_id!: string;

  @Index()
  @Column({ type: "bigint" })
  course_id!: string;

  @Index()
  @Column({ type: "bigint", nullable: true })
  content_id?: string;

  @Column({
    type: "enum",
    enum: LearningAction,
    default: LearningAction.VIDEO_START,
  })
  action!: LearningAction;

@Column({ type: 'timestamptz' })
  start_time!: Date; 

  @Column({ type: 'timestamptz' })
  end_time!: Date;   

  @Column({ type: 'integer', default: 0 })
  duration_sec!: number; 

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @ManyToOne(() => CourseContent, { nullable: true })
  @JoinColumn({ name: "content_id", referencedColumnName: "content_id" })
  content?: CourseContent | null;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "student_id", referencedColumnName: "id" })
  student!: User;

  @ManyToOne(() => Course, { onDelete: "CASCADE" })
  @JoinColumn({ name: "course_id", referencedColumnName: "course_id" })
  course!: Course;
}
