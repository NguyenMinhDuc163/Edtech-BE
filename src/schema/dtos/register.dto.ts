import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { SystemRole } from '../entities/role.entity';

export class RegisterDto {
    @IsString()
    @IsNotEmpty({ message: 'Tên người dùng không được để trống' })
    @MinLength(3, { message: 'Tên người dùng phải có ít nhất 3 ký tự' })
    username!: string;
    
    @IsString()
    @IsNotEmpty({ message: 'Email không được để trống' })
    @IsEmail({}, { message: 'Email không hợp lệ' })
    email!: string;

    @IsString()
    @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
    @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
    password!: string;

    @IsOptional()
    @IsEnum(SystemRole, { message: 'Vai trò không hợp lệ' })
    role?: SystemRole;
}