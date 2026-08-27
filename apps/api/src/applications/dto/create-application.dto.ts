import { createZodDto } from 'nestjs-zod';
import { createApplicationSchema } from '@bewerber/shared';

export class CreateApplicationDto extends createZodDto(
  createApplicationSchema,
) {}
