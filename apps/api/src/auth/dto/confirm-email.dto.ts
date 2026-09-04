import { createZodDto } from 'nestjs-zod';
import { confirmEmailSchema } from '@bewerber/shared';

export class ConfirmEmailDto extends createZodDto(confirmEmailSchema) {}
