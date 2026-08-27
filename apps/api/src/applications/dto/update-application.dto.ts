import { createZodDto } from 'nestjs-zod';
import { updateApplicationSchema } from '@bewerber/shared';

export class UpdateApplicationDto extends createZodDto(
  updateApplicationSchema,
) {}
