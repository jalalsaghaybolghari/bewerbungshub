import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SystemSettings,
  SystemSettingsSchema,
} from './schemas/system-settings.schema';
import { SystemSettingsService } from './system-settings.service';

// Not @Global() — unlike AuthModule (global because JwtAuthGuard is used
// via @UseGuards in 7 unrelated modules), only AuthModule and AdminModule
// need this, so both just import it explicitly.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemSettings.name, schema: SystemSettingsSchema },
    ]),
  ],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
