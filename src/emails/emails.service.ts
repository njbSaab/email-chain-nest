import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST'),
      port: +config.get('SMTP_PORT'),
      secure: false,
      auth: {
        user: config.get('SMTP_USER'),
        pass: config.get('SMTP_PASS'),
      },
    });
  }

  async send(to: string, subject: string, html: string) {
    const info = await this.transporter.sendMail({
      from: this.config.get('EMAIL_FROM'),
      to,
      subject,
      html,
    });
    this.logger.log(`Sent: ${info.messageId} → ${to}`);
  }
}