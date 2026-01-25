import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ChangePassDto {
  @IsNotEmpty()
  oldPassword!: string;

  @IsString()
  @IsNotEmpty({ message: "Mật khẩu mới không được để trống" })
  @MinLength(6, { message: "Mật khẩu mới phải có ít nhất 6 ký tự" })
  newPassword!: string;
}
