// src/emails/email-chain-quiz/email-chain-quiz.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { EmailChainQuizController } from './email-chain-quiz.controller';
import { EmailChainQuizService } from './email-chain-quiz.service';
import { EmailChainQuizProcessor } from './email-chain-quiz.processor';
import { EmailsService } from '../emails.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  controllers: [EmailChainQuizController],
  providers: [
    EmailChainQuizService,
    EmailChainQuizProcessor,  // ← ДОБАВИТЬ!
    EmailsService,             // ← ДОБАВИТЬ!
  ],
})
export class EmailChainQuizModule {}