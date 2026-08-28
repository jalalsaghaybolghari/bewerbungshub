import { createZodDto } from 'nestjs-zod';
import { updateInterviewSchema } from '@bewerber/shared';

export class UpdateInterviewDto extends createZodDto(updateInterviewSchema) {}
