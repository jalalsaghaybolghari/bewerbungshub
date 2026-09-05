import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type {
  AuthUser,
  ConfirmEmailInput,
  LoginInput,
  RegisterInput,
  ResendCodeInput,
} from '@bewerber/shared';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { MailService } from '../mail/mail.service';

// How long a code is valid for once sent, and the minimum gap enforced
// between resends of the same account's code.
const CODE_EXPIRES_IN_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

// Purely cosmetic — lets a key be recognized at a glance (e.g. in a
// secrets scanner or a config file) the way GitHub/Stripe keys are
// prefixed. Carries no meaning to the server itself.
const API_KEY_PREFIX = 'bwh_';

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
    isAdmin: user.isAdmin,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // No tokens issued here — an unverified account gets no session at all
  // until confirmEmail succeeds (see the module-level comment in the
  // plan / README for why: this avoids needing an emailVerified gate on
  // every protected route, since there's simply nothing to gate).
  async register(input: RegisterInput): Promise<{ email: string }> {
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

    await this.sendVerificationCode(user);
    return { email: user.email };
  }

  async login(
    input: LoginInput,
  ): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const user = await this.usersService.findByEmail(input.email);
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // A correct password alone must not grant access — otherwise
    // confirmEmail could just be skipped entirely.
    if (!user.emailVerified) {
      throw new ForbiddenException({
        message: 'Please verify your email before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    const tokens = await this.issueTokenPair(user);
    return { user: toAuthUser(user), tokens };
  }

  async confirmEmail(
    input: ConfirmEmailInput,
  ): Promise<{ user: AuthUser; tokens: TokenPair }> {
    const user = await this.usersService.findByEmail(input.email);
    if (!user) throw new NotFoundException('No account with this email');
    if (user.emailVerified) {
      throw new ConflictException('Email already verified — log in instead');
    }
    if (
      !user.emailVerificationCodeHash ||
      !user.emailVerificationCodeExpiresAt
    ) {
      throw new BadRequestException(
        'No pending verification code — request a new one',
      );
    }
    if (user.emailVerificationCodeExpiresAt < new Date()) {
      await this.usersService.invalidateEmailVerificationCode(user.id);
      throw new BadRequestException('Code expired — request a new one');
    }
    if (user.emailVerificationAttempts >= MAX_CODE_ATTEMPTS) {
      await this.usersService.invalidateEmailVerificationCode(user.id);
      throw new BadRequestException(
        'Too many incorrect attempts — request a new one',
      );
    }
    if (!(await argon2.verify(user.emailVerificationCodeHash, input.code))) {
      await this.usersService.incrementEmailVerificationAttempts(user.id);
      throw new BadRequestException('Incorrect code');
    }

    await this.usersService.markEmailVerified(user.id);
    const tokens = await this.issueTokenPair(user);
    return { user: toAuthUser(user), tokens };
  }

  async resendCode(input: ResendCodeInput): Promise<void> {
    const user = await this.usersService.findByEmail(input.email);
    if (!user) throw new NotFoundException('No account with this email');
    if (user.emailVerified) {
      throw new ConflictException('Email already verified — log in instead');
    }
    if (
      user.emailVerificationLastSentAt &&
      Date.now() - user.emailVerificationLastSentAt.getTime() <
        RESEND_COOLDOWN_MS
    ) {
      throw new HttpException(
        'Please wait a bit before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.sendVerificationCode(user);
  }

  private async sendVerificationCode(user: UserDocument): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + CODE_EXPIRES_IN_MS);
    await this.usersService.setEmailVerificationCode(
      user.id,
      codeHash,
      expiresAt,
    );
    await this.mailService.sendVerificationCode(user.email, code);
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

  // Returns the raw key exactly once — only its hash is ever persisted,
  // so there's no way to retrieve it again later, matching how every
  // "personal access token" UX (GitHub, Stripe, ...) works. Generating a
  // new one silently invalidates whatever key existed before.
  async generateApiKey(
    userId: string,
  ): Promise<{ apiKey: string; createdAt: Date }> {
    const apiKey = `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
    const createdAt = new Date();
    await this.usersService.setApiKeyHash(userId, this.hashApiKey(apiKey));
    return { apiKey, createdAt };
  }

  async revokeApiKey(userId: string): Promise<void> {
    await this.usersService.clearApiKeyHash(userId);
  }

  async getApiKeyStatus(
    userId: string,
  ): Promise<{ hasKey: boolean; createdAt?: Date }> {
    const user = await this.usersService.findById(userId);
    return {
      hasKey: !!user?.apiKeyHash,
      createdAt: user?.apiKeyCreatedAt,
    };
  }

  // Used by JwtAuthGuard as the fallback when the bearer token isn't a
  // valid JWT — returns the same shape either way (see RequestUser) so
  // every existing @UseGuards(JwtAuthGuard) route transparently accepts
  // an API key too, without having to touch each controller.
  async validateApiKey(
    rawKey: string,
  ): Promise<{ userId: string; email: string } | null> {
    const user = await this.usersService.findByApiKeyHash(
      this.hashApiKey(rawKey),
    );
    if (!user) return null;
    return { userId: user._id.toString(), email: user.email };
  }

  private hashApiKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
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
