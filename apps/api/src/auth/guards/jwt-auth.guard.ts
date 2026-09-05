import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import type { RequestUser } from '../decorators/current-user.decorator';

// Accepts either a real login JWT (short-lived, from /auth/login or
// /auth/confirm-email) or a long-lived personal API key (from
// /auth/api-key) as the bearer token — both resolve to the same
// RequestUser shape, so every existing @UseGuards(JwtAuthGuard) route
// transparently supports both without any controller changes. JWT is
// tried first since it's the common case (the web app on every request);
// falling through to an API-key lookup only costs a DB query when the
// token isn't a valid JWT at all, e.g. because it's an API key.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const token = this.extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const jwtUser = await this.tryVerifyJwt(token);
    if (jwtUser) {
      request.user = jwtUser;
      return true;
    }

    const apiKeyUser = await this.authService.validateApiKey(token);
    if (apiKeyUser) {
      request.user = apiKeyUser;
      return true;
    }

    throw new UnauthorizedException('Invalid or expired credentials');
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    return header.slice('Bearer '.length);
  }

  private async tryVerifyJwt(token: string): Promise<RequestUser | null> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
      }>(token, { secret: this.config.get<string>('jwt.accessSecret') });
      return { userId: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }
}
