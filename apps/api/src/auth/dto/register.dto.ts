import { createZodDto } from 'nestjs-zod';
import { registerSchema } from '@bewerber/shared';

export class RegisterDto extends createZodDto(registerSchema) {}
