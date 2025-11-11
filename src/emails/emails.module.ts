// src/emails/emails.module.ts
import { Module } from '@nestjs/common';
import { EmailsService } from './emails.service';
import { EmailChainQuizModule } from './email-chain-quiz/email-chain-quiz.module';

@Module({
  imports: [EmailChainQuizModule],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class EmailsModule {}