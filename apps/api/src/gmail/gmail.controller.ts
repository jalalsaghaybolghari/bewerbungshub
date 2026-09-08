import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { GmailService } from './gmail.service';
import { EmailMatchService } from './email-match.service';

const STATE_PURPOSE = 'gmail-connect';
const STATE_EXPIRES_IN = '10m';

interface ConnectState {
  sub: string;
  purpose: typeof STATE_PURPOSE;
}

@Controller('gmail')
export class GmailController {
  constructor(
    private readonly gmailService: GmailService,
    private readonly emailMatchService: EmailMatchService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: RequestUser) {
    return this.gmailService.getStatus(user.userId);
  }

  @Get('pending')
  @UseGuards(JwtAuthGuard)
  pending(@CurrentUser() user: RequestUser) {
    return this.emailMatchService.findPending(user.userId);
  }

  @Get('unmatched')
  @UseGuards(JwtAuthGuard)
  unmatched(@CurrentUser() user: RequestUser) {
    return this.emailMatchService.findUnmatched(user.userId);
  }

  @Post('pending/:id/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async approvePending(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.emailMatchService.approve(user.userId, id);
  }

  @Post('pending/:id/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectPending(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.emailMatchService.reject(user.userId, id);
  }

  @Post('unmatched/:id/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectUnmatched(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.emailMatchService.rejectUnmatched(user.userId, id);
  }

  // Same reasoning as GoogleDriveController.connectUrl — a plain browser
  // navigation can't carry our Authorization header, so this is the
  // Bearer-authenticated half (called via AJAX) that hands back a URL
  // carrying a signed, short-lived `state` instead.
  @Get('connect-url')
  @UseGuards(JwtAuthGuard)
  async connectUrl(@CurrentUser() user: RequestUser) {
    const state = await this.jwtService.signAsync(
      { sub: user.userId, purpose: STATE_PURPOSE } satisfies ConnectState,
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: STATE_EXPIRES_IN,
      },
    );
    return { url: this.gmailService.buildAuthUrl(state) };
  }

  // Hit directly by Google's redirect — never guarded, no Bearer header
  // available on this request. `state` (verified below) is the only thing
  // identifying which user is completing the flow.
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const webAppUrl = this.config.get<string>('webAppUrl');

    if (error || !code || !state) {
      return res.redirect(`${webAppUrl}/settings?gmailError=denied`);
    }

    let payload: ConnectState;
    try {
      payload = await this.jwtService.verifyAsync(state, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      return res.redirect(`${webAppUrl}/settings?gmailError=invalid_state`);
    }
    if (payload.purpose !== STATE_PURPOSE) {
      return res.redirect(`${webAppUrl}/settings?gmailError=invalid_state`);
    }

    try {
      await this.gmailService.completeConnection(payload.sub, code);
    } catch {
      return res.redirect(`${webAppUrl}/settings?gmailError=connect_failed`);
    }

    return res.redirect(`${webAppUrl}/settings?gmailConnected=1`);
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: RequestUser) {
    await this.gmailService.disconnect(user.userId);
  }
}
