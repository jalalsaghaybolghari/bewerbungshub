import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';

const sendMock = jest.fn<
  Promise<{ data: { id: string } | null; error: { message: string } | null }>,
  [unknown]
>();

// Mocks the `resend` package directly, the same way google-drive.service.spec.ts
// mocks `googleapis` — this is the actual external boundary being tested.
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { MailService } from './mail.service';

function makeConfig() {
  return {
    get: jest.fn((key: string) => {
      if (key === 'mail.resendApiKey') return 'test-api-key';
      if (key === 'mail.from') return 'BewerbungsHub <test@example.com>';
      return undefined;
    }),
  };
}

describe('MailService', () => {
  let service: MailService;

  beforeEach(() => {
    sendMock.mockReset();
    service = new MailService(makeConfig() as unknown as ConfigService);
  });

  it('sends the code in the email body to the right address (happy path)', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    await service.sendVerificationCode('alice@example.com', '123456');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload] = sendMock.mock.calls[0] as [
      { to: string; from: string; html: string },
    ];
    expect(payload.to).toBe('alice@example.com');
    expect(payload.from).toBe('BewerbungsHub <test@example.com>');
    expect(payload.html).toContain('123456');
  });

  it('throws instead of silently swallowing a Resend API error (negative case)', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key' },
    });

    await expect(
      service.sendVerificationCode('alice@example.com', '123456'),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
