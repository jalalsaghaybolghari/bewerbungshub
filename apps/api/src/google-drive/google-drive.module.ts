import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { TokenEncryptionService } from '../common/token-encryption.service';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveService } from './google-drive.service';

@Module({
  imports: [UsersModule, JwtModule.register({})],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService, TokenEncryptionService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
