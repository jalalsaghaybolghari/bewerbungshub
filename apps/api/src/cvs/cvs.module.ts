import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageModule } from '../storage/storage.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { ApplicationsModule } from '../applications/applications.module';
import { Cv, CvSchema } from './schemas/cv.schema';
import { CvsController } from './cvs.controller';
import { CvsService } from './cvs.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cv.name, schema: CvSchema }]),
    StorageModule,
    GoogleDriveModule,
    ApplicationsModule,
  ],
  controllers: [CvsController],
  providers: [CvsService],
  exports: [CvsService, MongooseModule],
})
export class CvsModule {}
