import { createZodDto } from 'nestjs-zod';
import { adminUsersQuerySchema } from '@bewerber/shared';

export class AdminUsersQueryDto extends createZodDto(adminUsersQuerySchema) {}
