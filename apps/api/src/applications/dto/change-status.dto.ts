import { createZodDto } from 'nestjs-zod';
import { changeApplicationStatusSchema } from '@bewerber/shared';

export class ChangeStatusDto extends createZodDto(
  changeApplicationStatusSchema,
) {}
