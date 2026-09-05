import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Global because JwtAuthGuard (used via @UseGuards(JwtAuthGuard) in every
// other feature module — applications, cvs, users, interviews,
// follow-ups, google-drive) now depends on AuthService and JwtService to
// support API-key auth alongside the login JWT. Without @Global, each of
// those modules would need to explicitly import AuthModule just to
// satisfy the guard's own dependencies, for something that has nothing
// to do with their own domain.
@Global()
@Module({
  imports: [UsersModule, MailModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
