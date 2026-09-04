import { createZodDto } from 'nestjs-zod';
import { duplicateGroupsQuerySchema } from '@bewerber/shared';

export class DuplicateGroupsQueryDto extends createZodDto(
  duplicateGroupsQuerySchema,
) {}
