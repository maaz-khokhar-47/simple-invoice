import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { JwtPayload } from './auth.types';
import { LoginResponseDto, UserProfileDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login({ email, password }: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Same error for unknown email and wrong password, so we don't reveal which accounts exist
    const passwordOk =
      user != null && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get<number>('JWT_EXPIRES_IN', 3600),
      user: { id: user.id, email: user.email, fullname: user.fullname },
    };
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullname: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
