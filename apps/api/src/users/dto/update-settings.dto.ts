import { createZodDto } from 'nestjs-zod';
import { updateUserSettingsSchema } from '@bewerber/shared';

export class UpdateSettingsDto extends createZodDto(updateUserSettingsSchema) {}
