import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString } from "class-validator";

export enum LeaderboardSortBy {
  TOTAL_SCORE = "total_score",
  AVG_SCORE = "avg_score",
  COMPLETED_QUIZZES = "completed_quizzes",
  PASS_RATE = "pass_rate",
}

export class LeaderboardQueryDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  quizId?: string;

  @IsOptional()
  @IsEnum(["ASC", "DESC"])
  order?: "ASC" | "DESC" = "DESC";

  @IsOptional()
  @IsEnum(LeaderboardSortBy)
  sortBy?: LeaderboardSortBy = LeaderboardSortBy.TOTAL_SCORE;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
