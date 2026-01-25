import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PasswordResetToken } from "../schema/entities/password-reset-token.entity";
import { User } from "../schema/entities/user.entity";
import { EmailService } from "../services/auth-email.service";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { ForgotPasswordDto } from "../schema/dtos/forgot-password.dto";
import { ResetPasswordDto } from "../schema/dtos/reset-password.dto";
import dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(PasswordResetToken)
    private resetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private emailService: EmailService
  ) {}

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user)
      throw new NotFoundException("Không tìm thấy người dùng với email này");

    await this.resetTokenRepo.delete({ user });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.resetTokenRepo.save({ user, token, expiresAt });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await this.emailService.sendPasswordResetEmail(dto.email, resetLink);
  }

  async resetPassword(resetPasssDTO: ResetPasswordDto) {
    const resetToken = await this.resetTokenRepo.findOne({
      where: { token: resetPasssDTO.token },
      relations: ["user"],
    });
    if (!resetToken) throw new BadRequestException("Token không hợp lệ");
    if (resetToken.expiresAt < new Date())
      throw new BadRequestException("Token đã hết hạn");

    const hashed = await bcrypt.hash(resetPasssDTO.newPassword, 10);
    await this.userRepo.update(resetToken.user.id, { password: hashed });

    await this.resetTokenRepo.delete(resetToken.id);
  }
}
