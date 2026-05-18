import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

type InvitationEmailInput = {
  to: string;
  leagueName: string;
  roleLabel: string;
  expiresAt: Date;
  acceptUrl: string;
};

@Injectable()
export class InvitationEmailService {
  private readonly logger = new Logger(InvitationEmailService.name);

  async sendInvitationEmail(input: InvitationEmailInput) {
    const transportMode = (process.env.EMAIL_TRANSPORT ?? 'smtp').trim().toLowerCase();
    const host = process.env.SMTP_HOST?.trim();
    const port = process.env.SMTP_PORT?.trim();
    const user = (process.env.SMTP_USER ?? process.env.SMTP_USERNAME)?.trim();
    const pass = (process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD)?.replace(/\s+/g, '').trim();
    const from = (process.env.SMTP_FROM ?? user)?.trim();

    const subject = `You're invited to join ${input.leagueName}`;
    const expiresText = input.expiresAt.toUTCString();
    const text = [
      `You have been invited to ${input.leagueName} as ${input.roleLabel}.`,
      `This invitation expires on ${expiresText}.`,
      `Open this link to continue: ${input.acceptUrl}`,
    ].join('\n\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 16px">You're invited to ${input.leagueName}</h2>
        <p style="margin:0 0 12px">You were invited as <strong>${input.roleLabel}</strong>.</p>
        <p style="margin:0 0 12px">This invitation expires on <strong>${expiresText}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${input.acceptUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px">
            Accept invitation
          </a>
        </p>
        <p style="margin:0;color:#6b7280;font-size:14px">If the button does not work, copy and paste this URL: ${input.acceptUrl}</p>
      </div>
    `;

    if (transportMode === 'console') {
      this.logger.log(
        `Invitation email queued for ${input.to}\nSubject: ${subject}\nExpires: ${expiresText}\nLink: ${input.acceptUrl}`,
      );
      this.logger.debug(text);
      return;
    }

    if (!host || !port || !from) {
      throw new Error('SMTP configuration is missing. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM.');
    }

    if (host === 'smtp.example.com') {
      throw new Error('SMTP_HOST is still set to the placeholder smtp.example.com. Set it to your real SMTP server.');
    }

    const transport = createTransport({
      host,
      port: Number(port),
      secure: process.env.SMTP_SECURE === 'true',
      auth: user && pass ? { user, pass } : undefined,
    });

    await transport.sendMail({
      from,
      to: input.to,
      subject,
      text,
      html,
    });
  }
}
