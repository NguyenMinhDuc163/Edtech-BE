import { IsEmail } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail({}, { message: "Email không hợp lệ" })
  email!: string;
}
