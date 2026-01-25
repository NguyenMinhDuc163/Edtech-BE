import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsOptional,
} from "class-validator";
import { RelationshipType } from "../entities/content_relationships.entity";

export class CreateRelationDto {
  @IsNotEmpty()
  parent_content_id!: string;

  @IsNotEmpty()
  child_content_id!: string;

  @IsEnum(RelationshipType)
  relation_type!: RelationshipType;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  weight?: number;
}

export class RemoveRelationDto {
  @IsNotEmpty()
  relation_id!: string;
}
