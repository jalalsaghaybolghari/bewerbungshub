import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { TokenEncryptionService } from '../common/token-encryption.service';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';

@Module({
  imports: [UsersModule, JwtModule.register({})],
  controllers: [GmailController],
  providers: [GmailService, TokenEncryptionService],
  exports: [GmailService],
})
export class GmailModule {}
