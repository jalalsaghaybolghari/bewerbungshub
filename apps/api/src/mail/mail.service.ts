import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('mail.resendApiKey'));
    this.from = this.config.get<string>('mail.from')!;
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Your BewerbungsHub verification code',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h1 style="font-size: 18px;">Confirm your email</h1>
          <p>Enter this code to finish creating your BewerbungsHub account:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${code}</p>
          <p style="color: #666; font-size: 13px;">This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });

    // Resend's SDK returns { error } instead of throwing on API failure —
    // a real failure here means the user genuinely won't get their code,
    // so it must surface as an error, not be swallowed as a silent no-op.
    if (error) {
      throw new InternalServerErrorException(
        `Failed to send verification email: ${error.message}`,
      );
    }
  }
}
