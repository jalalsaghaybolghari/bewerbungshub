import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { InterviewsService } from './interviews.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { UpdateInterviewDto } from './dto/update-interview.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post('applications/:applicationId/interviews')
  create(
    @CurrentUser() user: RequestUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateInterviewDto,
  ) {
    return this.interviewsService.create(user.userId, applicationId, dto);
  }

  @Patch('interviews/:id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.interviewsService.update(user.userId, id, dto);
  }

  @Delete('interviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.interviewsService.remove(user.userId, id);
  }
}
