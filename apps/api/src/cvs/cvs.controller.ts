import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CvsService } from './cvs.service';
import { CreateCvDto } from './dto/create-cv.dto';
import { UpdateCvDto } from './dto/update-cv.dto';

@UseGuards(JwtAuthGuard)
@Controller('cvs')
export class CvsController {
  constructor(private readonly cvsService: CvsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.cvsService.findAllForUser(user.userId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCvDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.cvsService.create(user.userId, dto, file);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCvDto,
  ) {
    return this.cvsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cvsService.remove(user.userId, id);
  }

  @Get(':id/view-url')
  async getViewUrl(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const url = await this.cvsService.getViewUrl(user.userId, id);
    return { url };
  }

  @Get(':id/file')
  async getFile(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { url, buffer, mimeType, fileName } = await this.cvsService.getFile(
      user.userId,
      id,
    );
    if (url) {
      return res.redirect(url);
    }
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  }
}
