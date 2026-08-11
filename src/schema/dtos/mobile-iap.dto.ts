import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import {
  StorePlatform,
  StoreProductType,
  StoreProvider,
} from '../entities/course-store-product.entity';

export enum IapSyncReason {
  PURCHASE = 'PURCHASE',
  RESTORE = 'RESTORE',
  APP_RESUME = 'APP_RESUME',
}

export class MobileIapPlatformDto {
  @IsEnum(StorePlatform)
  platform!: StorePlatform;
}

export class MobileIapSyncDto {
  @IsEnum(IapSyncReason)
  reason!: IapSyncReason;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productId?: string;
}

export class CreateCourseStoreProductDto {
  @IsEnum(StorePlatform)
  platform!: StorePlatform;

  @IsEnum(StoreProvider)
  store!: StoreProvider;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  productId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  entitlementId!: string;

  @IsOptional()
  @IsEnum(StoreProductType)
  productType?: StoreProductType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCourseStoreProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  entitlementId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCourseMobileIapDto {
  @IsBoolean()
  mobileIapEnabled!: boolean;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}
