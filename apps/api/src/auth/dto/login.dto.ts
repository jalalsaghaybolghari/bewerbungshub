import { createZodDto } from 'nestjs-zod';
import { loginSchema } from '@bewerber/shared';

export class LoginDto extends createZodDto(loginSchema) {}
