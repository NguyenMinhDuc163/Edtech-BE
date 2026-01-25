import { JwtService } from '@nestjs/jwt';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service';
import { LoginDto } from '../schema/dtos/login.dto';
import { RegisterDto } from '../schema/dtos/register.dto';
import { User } from '../schema/entities/user.entity';
import { instanceToPlain } from 'class-transformer';
import * as bcrypt from "bcrypt";
import { RefreshTokenService } from "../services/refresh-token.service";
import { SystemParameterService } from "../services/system-parameter.service";
import { StorageService } from "./storage.service";
import { Request } from 'express';

@Injectable()
export class AuthService {
    constructor(
        private userService: UserService,
        private jwtService: JwtService,
        private refreshTokenService: RefreshTokenService,
        private systemParameterService: SystemParameterService,
        private storageService: StorageService
    ) { }

    async register(registerDto: RegisterDto): Promise<User> {
        const user = await this.userService.create(registerDto);
        return instanceToPlain(user) as User;
    }

    async login(loginDto: LoginDto, req: Request): Promise<{ access_token: string, refresh_token: string, user: any, isPayment: string }> {
        const user = await this.validateUserCredentials(loginDto);
        const payload = {
            sub: user.id,
            role: user.roles?.[0]?.role.name
        };
        const access_token = await this.generateAccessToken(payload);
        const refresh_token = await this.generateRefreshToken(payload);

        const deviceInfo = req.headers['user-agent'] || 'unknown';
        const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';

        await this.refreshTokenService.removeExpiredTokens(user.id);
        await this.refreshTokenService.limitUserTokens(user.id, 5);
        await this.refreshTokenService.create(user.id, refresh_token, deviceInfo, ip);

        const isPayment = await this.systemParameterService.getValue('IS_PAYMENT', 'N', true);

        const profile = await this.userService.getProfileWithCertificates(user.id);

        let avatarSasUrl: string | null = null;
        if (profile.avatar_url) {
            try {
                avatarSasUrl = await this.storageService.generateSasUrlFromUrl(
                    profile.avatar_url,
                    'image',
                    87600
                );
            } catch (error) {
                console.error('Error generating SAS URL for avatar:', error);
            }
        }

        const certificatesWithSas = await Promise.all(
            (profile.certificates || []).map(async (cert) => {
                let fileSasUrl: string | null = null;
                if (cert.file_url) {
                    try {
                        fileSasUrl = await this.storageService.generateSasUrlFromUrl(
                            cert.file_url,
                            'document',
                            87600
                        );
                    } catch (error) {
                        console.error('Error generating SAS URL for certificate file:', error);
                    }
                }
                return {
                    id: cert.id,
                    title: cert.title,
                    description: cert.description,
                    issued_by: cert.issued_by,
                    issued_at: cert.issued_at,
                    expires_at: cert.expires_at,
                    file_url: fileSasUrl,
                    created_at: cert.created_at,
                    updated_at: cert.updated_at,
                };
            })
        );

        const userInfo = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.roles?.[0]?.role.name,
            full_name: profile.full_name ?? null,
            avatar_url: avatarSasUrl,
            phone: profile.phone ?? null,
            grade: profile.grade ?? null,
            subject_specialty: profile.subject_specialty ?? null,
            certificates: certificatesWithSas.length > 0 ? certificatesWithSas : null,
        };

        return { access_token, refresh_token, user: userInfo, isPayment };
    }

    async validateUserCredentials(loginDto: LoginDto): Promise<User> {
        const user = await this.userService.findByUsername(loginDto.username);
        if (!user) {
            throw new UnauthorizedException('Tài khoản hoặc mật khẩu không đúng');
        }
        const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Tài khoản hoặc mật khẩu không đúng');
        }
        return user;
    }

    async refresh(currentRefreshToken: string, req: Request) {
        let payload;
        try {
            payload = this.jwtService.verify(currentRefreshToken);
        } catch (err) {
            throw new UnauthorizedException("Refresh token không hợp lệ");
        }

        const userId = payload.sub;

        await this.refreshTokenService.removeExpiredTokens(userId);

        const isValid = await this.refreshTokenService.validate(userId, currentRefreshToken);
        if (!isValid) {
            await this.refreshTokenService.revokeAll(userId);
            throw new UnauthorizedException("Refresh token đã bị thu hồi hoặc không hợp lệ");
        }

        const newPayload = {
            sub: userId,
            role: payload.role,
        };

        const access_token = await this.generateAccessToken(newPayload);
        const new_refresh_token = await this.generateRefreshToken(newPayload);

        const deviceInfo = req.headers["user-agent"] || "unknown";
        const ip =
            (req.headers["x-forwarded-for"] as string) || req.ip || "unknown";

        await this.refreshTokenService.rotateToken(userId, currentRefreshToken, new_refresh_token, deviceInfo, ip);

        return { access_token, new_refresh_token };
    }

    async logout(refreshToken: string): Promise<void> {
        let decoded = this.jwtService.verify(refreshToken);
        const userId = decoded.sub;
        await this.refreshTokenService.revokeOne(userId, refreshToken);
    }

    async generateAccessToken(payload: any): Promise<string> {
        const accessTime = await this.systemParameterService.getValue('ACCESS_TIME', '900');
        console.log('ACCESS_TIME from DB:', accessTime);
        return this.jwtService.sign(payload, { expiresIn: `${accessTime}s` });
    }

    async generateRefreshToken(payload: any): Promise<string> {
        const refreshTime = await this.systemParameterService.getValue('REFRESH_TIME', '604800');
        console.log('REFRESH_TIME from DB:', refreshTime);
        return this.jwtService.sign(payload, { expiresIn: `${refreshTime}s` });
    }

    async saveRefreshToken(userId: string, refreshToken: string, deviceInfo: string, ip: string): Promise<void> {
        await this.refreshTokenService.removeExpiredTokens(userId);
        await this.refreshTokenService.limitUserTokens(userId, 5);
        await this.refreshTokenService.create(userId, refreshToken, deviceInfo, ip);
    }
}