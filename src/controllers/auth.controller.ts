import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { LoginDto } from "../schema/dtos/login.dto";
import { RegisterDto } from "../schema/dtos/register.dto";
import { GoogleLoginDto } from "../schema/dtos/google-login.dto";
import { AuthService } from "../services/auth.service";
import { GoogleAuthService } from "../services/google-auth.service";
import { Request, Response } from "express";
import dotenv from "dotenv";
import { PasswordResetService } from "../services/password-reset.service";
import { ForgotPasswordDto } from "../schema/dtos/forgot-password.dto";
import { ResetPasswordDto } from "../schema/dtos/reset-password.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { UserService } from "../services/user.service";
import { ChangePassDto } from "../schema/dtos/change-password.dto";
dotenv.config();

@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private googleAuthService: GoogleAuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly userService: UserService
  ) { }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request
  ) {
    const { access_token, refresh_token, user, isPayment, isAds } = await this.authService.login(
      loginDto,
      req
    );

    return {
      access_token,
      refresh_token,
      user,
      isPayment,
      isAds
    };
  }

  @Post("register")
  @HttpCode(201)
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Body() body: { refresh_token: string },
  ) {
    if (!body.refresh_token) {
      throw new UnauthorizedException("Token không tồn tại");
    }

    const { access_token, new_refresh_token } =
      await this.authService.refresh(body.refresh_token, req);

    return {
      access_token,
      refresh_token: new_refresh_token,
    };
  }


  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body?: any) {
    const refresh_token = req.cookies?.refresh_token || body?.refresh_token;
    if (refresh_token) {
      await this.authService.logout(refresh_token);
    }

    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return { message: "Đăng xuất thành công" };
  }

  //   @UseGuards(JwtAuthGuard)
  //   @Post("logout-all")
  //   async logoutAll(@Req() req: any, @Res({ passthrough: true }) res: Response) {
  //   }

  @Post("password/forgot")
  @HttpCode(200)
  async forgot(@Body() fotgotPassDto: ForgotPasswordDto) {
    await this.passwordResetService.requestPasswordReset(fotgotPassDto);
    return { message: "Đã gửi email đặt lại mật khẩu nếu email tồn tại" };
  }

  @Post("password/reset")
  @HttpCode(200)
  async reset(@Body() resetPasssDto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(resetPasssDto);
    return { message: "Đặt lại mật khẩu thành công" };
  }

  @UseGuards(JwtAuthGuard)
  @Post("password/change")
  @HttpCode(200)
  async changePassword(@Req() req: any, @Body() changePassDto: ChangePassDto) {
    const userId = req.user.id;
    await this.userService.changePassword(userId, changePassDto);

    return { message: 'Đổi mật khẩu thành công' };
  }

  @Post("google/login")
  @HttpCode(200)
  async googleLogin(
    @Body() googleLoginDto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request
  ) {
    const profile = await this.googleAuthService.verifyToken(googleLoginDto.idToken);
    const user = await this.googleAuthService.findOrCreateUser(profile);

    if (!user) {
      throw new UnauthorizedException('Unable to authenticate user');
    }

    const payload = {
      sub: user.id,
      role: user.roles?.[0]?.role.name
    };
    const access_token = await this.authService.generateAccessToken(payload);
    const refresh_token = await this.authService.generateRefreshToken(payload);

    const deviceInfo = req.headers['user-agent'] || 'unknown';
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';

    await this.authService.saveRefreshToken(user.id, refresh_token, deviceInfo, ip);

    res.cookie("refresh_token", refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.roles?.[0]?.role.name
      }
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @HttpCode(200)
  async getMe(@Req() req: any) {
    return this.userService.getProfile(req.user.id);
  }
}
