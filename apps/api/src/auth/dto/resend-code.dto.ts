import { createZodDto } from 'nestjs-zod';
import { resendCodeSchema } from '@bewerber/shared';

export class ResendCodeDto extends createZodDto(resendCodeSchema) {}
