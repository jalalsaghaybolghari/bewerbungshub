import { createZodDto } from 'nestjs-zod';
import { updateAdminSettingsSchema } from '@bewerber/shared';

export class UpdateAdminSettingsDto extends createZodDto(
  updateAdminSettingsSchema,
) {}
