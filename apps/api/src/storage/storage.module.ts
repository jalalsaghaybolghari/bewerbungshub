import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalFsStorageProvider } from './providers/local-fs-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalFsStorageProvider,
    S3StorageProvider,
    {
      provide: StorageService,
      inject: [ConfigService, LocalFsStorageProvider, S3StorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalFsStorageProvider,
        s3: S3StorageProvider,
      ) => (config.get<string>('storage.driver') === 's3' ? s3 : local),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
