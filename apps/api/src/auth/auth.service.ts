import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AuthUser, LoginInput, RegisterInput } from '@bewerber/shared';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function toAuthUser(user: UserDocument): AuthUser {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    locale: user.locale,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(
    input: RegisterInput,
  ): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const existing = await this.usersService.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.usersService.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });

    const tokens = await this.issueTokenPair(user);
    return { user: toAuthUser(user), tokens };
  }

  async login(
    input: LoginInput,
  ): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const user = await this.usersService.findByEmail(input.email);
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokenPair(user);
    return { user: toAuthUser(user), tokens };
  }

  async refresh(
    refreshToken: string | undefined,
  ): Promise<{ user: AuthUser; tokens: TokenPair }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (
      !user?.refreshTokenHash ||
      !(await argon2.verify(user.refreshTokenHash, refreshToken))
    ) {
      // Reuse of a stale/rotated-out token — revoke defensively.
      if (user) await this.usersService.setRefreshTokenHash(user.id, undefined);
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    const tokens = await this.issueTokenPair(user);
    return { user: toAuthUser(user), tokens };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, undefined);
  }

  private async issueTokenPair(user: UserDocument): Promise<TokenPair> {
    // jti guarantees each issuance is a distinct token even if signed within
    // the same second as a previous one (JWT `iat` has 1s resolution) — without
    // it, two same-second refreshes would rotate to a byte-identical token,
    // silently defeating rotation for that window.
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      jti: randomUUID(),
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      // @nestjs/jwt types `expiresIn` against `ms`'s branded StringValue,
      // which can't be verified for a value read from env at runtime.
      expiresIn: this.config.get<string>(
        'jwt.accessExpiresIn',
      ) as unknown as number,
    });
    const refreshToken = await this.jwtService.signAsync(
      { sub: payload.sub, jti: randomUUID() },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>(
          'jwt.refreshExpiresIn',
        ) as unknown as number,
      },
    );

    await this.usersService.setRefreshTokenHash(
      user.id,
      await argon2.hash(refreshToken),
    );

    return { accessToken, refreshToken };
  }
}
