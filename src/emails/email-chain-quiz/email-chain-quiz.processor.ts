import { Process, Processor } from '@nestjs/bull';
import { PrismaService } from '../../prisma/prisma/prisma.service';
import { EmailsService } from '../emails.service';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

// Расширяем интерфейс Job
declare module 'bull' {
  interface Job {
    attempts: {
      made: number;
      count: number;
    };
  }
}
@Processor('email')
export class EmailChainQuizProcessor {
  private readonly logger = new Logger(EmailChainQuizProcessor.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailsService,
  ) {}

  @Process('send-followup')
  async handle(job: Job<any>) {
    const {
      email,
      templateId,
      userUuid,
      step,
      jobDbId,
    } = job.data;
  
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id: templateId },
    });
  
    if (!template) {
      this.logger.error(`Template ${templateId} not found`);
      return;
    }
  
    try {
      await this.emailService.send(email, template.subject, template.html);
  
      await this.prisma.emailJob.update({
        where: { id: jobDbId },
        data: {
          status: 'sent',
          sentAt: new Date(),
          attempts: job.attemptsMade, // ← ИСПРАВЛЕНО
        },
      });
  
      this.logger.log(`Отправлено: ${email} | step ${step}`);
    } catch (err) {
      this.logger.error(`Ошибка: ${err.message}`);
      throw err;
    }
  }
}