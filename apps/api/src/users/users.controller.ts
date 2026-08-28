import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/me/settings')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getSettings(@CurrentUser() user: RequestUser) {
    const found = await this.usersService.findById(user.userId);
    return found?.settings;
  }

  @Patch()
  updateSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.usersService
      .updateSettings(user.userId, dto)
      .then((u) => u?.settings);
  }
}
