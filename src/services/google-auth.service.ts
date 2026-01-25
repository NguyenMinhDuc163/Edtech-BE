import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { UserService } from './user.service';
import { RegisterDto } from '../schema/dtos/register.dto';

@Injectable()
export class GoogleAuthService {
  private googleClient: OAuth2Client;

  constructor(private userService: UserService) {
    this.googleClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID || ''
    );
  }

  async verifyToken(idToken: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID as string,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid token payload');
      }

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  async findOrCreateUser(profile: any) {
    let user = await this.userService.findByEmail(profile.email);

    if (!user) {
      const username = profile.email.split('@')[0];
      const registerDto: RegisterDto = {
        username,
        email: profile.email,
        password: Math.random().toString(36).slice(-10),
      };

      await this.userService.create(registerDto);
      user = await this.userService.findByEmail(profile.email);
    }

    if (!user) {
      throw new UnauthorizedException('Failed to create user');
    }

    return user;
  }
}
