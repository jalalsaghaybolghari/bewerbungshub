import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';

// Runs after JwtAuthGuard (@UseGuards(JwtAuthGuard, AdminGuard) — Nest runs
// guards left-to-right) so request.user is already populated. Looks the
// user up fresh on every request rather than trusting a claim baked into a
// JWT, since isAdmin has no self-service revoke flow yet — a JWT issued
// before a revoke shouldn't keep granting admin access after it.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    if (!request.user) throw new ForbiddenException('Admin access required');

    const user = await this.usersService.findById(request.user.userId);
    if (!user?.isAdmin) throw new ForbiddenException('Admin access required');

    return true;
  }
}
