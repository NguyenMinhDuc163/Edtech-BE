import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { CourseContent } from "./course-content.entity";

export enum RelationshipType {
  PREREQUISITE = "PREREQUISITE", // Học trước
  RELATED = "RELATED", // Gợi ý học thêm
  REMEDIAL = "REMEDIAL", // Ôn tập khi kết quả thấp
}

@Entity("content_relationships")
@Unique(['parent_content_id', 'child_content_id', 'relation_type'])
export class ContentRelationship {
  @PrimaryGeneratedColumn("increment", { type: "bigint" })
  id!: string;

  @Index()
  @Column({ type: "bigint", nullable: false })
  parent_content_id!: string;

  @ManyToOne(() => CourseContent, (c) => c.parentRelations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({
    name: "parent_content_id",
    referencedColumnName: "content_id",
  })
  parentContent!: CourseContent;

  @Index()
  @Column({ type: "bigint", nullable: false })
  child_content_id!: string;

  @ManyToOne(() => CourseContent, (c) => c.childRelations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({
    name: "child_content_id",
    referencedColumnName: "content_id",
  })
  childContent!: CourseContent;

  @Column({
    type: "enum",
    enum: RelationshipType,
    default: RelationshipType.RELATED,
  })
  relation_type!: RelationshipType;

  @Column({ type: "float", nullable: false, default: 0.5 })
  weight!: number;

  @Column({ type: "boolean", default: false })
  is_ai_generated!: boolean;

  @Column({ type: "boolean", default: false })
  is_verified!: boolean;
}
