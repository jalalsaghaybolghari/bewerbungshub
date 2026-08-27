import { createZodDto } from 'nestjs-zod';
import { applicationQuerySchema } from '@bewerber/shared';

export class ApplicationQueryDto extends createZodDto(applicationQuerySchema) {}
