import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { EmailChainQuizService } from './email-chain-quiz.service';

@Controller('email-chain-quiz')
export class EmailChainQuizController {
  constructor(private readonly service: EmailChainQuizService) {}

  @Post('trigger')
  async trigger(@Body() dto: {
    userUuid: string;
    email: string;
    quizId: number;
    geo: string;
  }) {
    if (!dto.userUuid || !dto.email || !dto.geo) {
      throw new BadRequestException('Missing required fields');
    }
    return this.service.triggerChain(dto);
  }

}