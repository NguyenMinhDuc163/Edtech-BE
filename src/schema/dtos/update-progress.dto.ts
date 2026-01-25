import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
} from "class-validator";
import { LearningAction } from "../entities/learning-log.entity";

export class UpdateProgressDto {
  @IsNotEmpty()
  @IsString()
  courseId!: string;

  @IsNotEmpty()
  @IsString()
  contentId!: string;

  @IsEnum(LearningAction)
  action!: LearningAction;

  @IsNumber()
  videoTimestamp!: number;

  @IsNumber()
  durationWatched!: number;

  @IsOptional()
  @IsNumber()
  totalDuration?: number;
}
