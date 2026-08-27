import { createZodDto } from 'nestjs-zod';
import { updateCvSchema } from '@bewerber/shared';

export class UpdateCvDto extends createZodDto(updateCvSchema) {}
