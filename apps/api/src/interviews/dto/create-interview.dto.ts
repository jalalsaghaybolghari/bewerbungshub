import { createZodDto } from 'nestjs-zod';
import { createInterviewSchema } from '@bewerber/shared';

export class CreateInterviewDto extends createZodDto(createInterviewSchema) {}
