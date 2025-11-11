// src/emails/email-chain-quiz/email-chain-quiz.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma/prisma.service';

@Injectable()
export class EmailChainQuizService {
  private readonly logger = new Logger(EmailChainQuizService.name);
  private readonly MERGE_WINDOW_MINUTES = 5;
  private readonly APP = 'quizvn';

  constructor(
    private prisma: PrismaService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  async triggerChain(dto: { userUuid: string; email: string; quizId: number; geo: string }) {
    const { userUuid, email, quizId, geo } = dto;
    const now = new Date();
    const windowExpiresAt = new Date(now.getTime() + this.MERGE_WINDOW_MINUTES * 60 * 1000);

    // 1. Ищем активное окно объединения
    const activeWindow = await this.prisma.emailJob.findFirst({
      where: {
        userUuid,
        mergeWindowExpiresAt: { gt: now },
        rootQuizId: { not: null },
      },
      orderBy: { id: 'desc' }, // ← ФИКС: createdAt нет в модели → используем id
    });

    if (activeWindow) {
      // Юзер уже в окне → объединяем в GENERAL
      const rootQuizId = activeWindow.rootQuizId!;
      const recentQuizzesCount = await this.prisma.emailJob.count({
        where: {
          userUuid,
          rootQuizId: { not: null },
          mergeWindowExpiresAt: {
            gte: new Date(now.getTime() - this.MERGE_WINDOW_MINUTES * 60 * 1000),
          },
        },
      });

      // Обновляем все pending джобы этой цепочки
      await this.prisma.emailJob.updateMany({
        where: {
          userUuid,
          rootQuizId,
          status: 'pending',
        },
        data: {
          chainType: 'GENERAL',
          quizCountAtStart: recentQuizzesCount,
          mergeWindowExpiresAt: windowExpiresAt,
        },
      });

      // Если ещё нет GENERAL цепочки — создаём
      const hasGeneral = await this.prisma.emailJob.findFirst({
        where: { userUuid, rootQuizId, chainType: 'GENERAL', status: 'pending' },
      });

      if (!hasGeneral) {
        await this.startGeneralChain({
          userUuid,
          email,
          geo,
          quizCountAtStart: recentQuizzesCount,
          rootQuizId,
          windowExpiresAt,
        });
      }

      this.logger.log(`Объединено в GENERAL | count=${recentQuizzesCount} | root=${rootQuizId}`);
      return { status: 'merged', count: recentQuizzesCount };
    } else {
      // Новая PERSONAL цепочка
      await this.startPersonalChain({
        userUuid,
        email,
        quizId,
        geo,
        windowExpiresAt,
      });

      this.logger.log(`Новая PERSONAL цепочка | quizId=${quizId}`);
      return { status: 'new', quizId };
    }
  }

  private async startPersonalChain(params: {
    userUuid: string;
    email: string;
    quizId: number;
    geo: string;
    windowExpiresAt: Date;
  }) {
    const { userUuid, email, quizId, geo, windowExpiresAt } = params;

    this.logger.log(`PERSONAL: quizId=${quizId}, geo=${geo}`);

    // ИЩЕМ ТОЛЬКО ПО quizId и geo (app игнорируем)
    const templates = await this.prisma.emailTemplate.findMany({
      where: {
        quizId: quizId,   // ← персональные
        geo: geo,
      },
      orderBy: { step: 'asc' },
    });

    if (templates.length === 0) {
      this.logger.log(`PERSONAL не найден → запускаем GENERAL`);
      return this.startGeneralChain({
        userUuid,
        email,
        geo,
        quizCountAtStart: 1,
        rootQuizId: quizId,
        windowExpiresAt,
      });
    }

    this.logger.log(`PERSONAL: найдено ${templates.length} шаблонов`);

    await this.createChainJobs(
      userUuid,
      email,
      quizId,
      geo,
      windowExpiresAt,
      templates,
      'PERSONAL',
      { rootQuizId: quizId }
    );
  }

  private async createChainJobs(
    userUuid: string,
    email: string,
    quizId: number,
    geo: string,
    windowExpiresAt: Date,
    templates: any[],
    chainType: 'PERSONAL' | 'GENERAL',
    extra?: { quizCountAtStart?: number; rootQuizId?: number }
  ) {
    const quizCountAtStart = extra?.quizCountAtStart || 1;
    const rootQuizId = extra?.rootQuizId || quizId;
  
    await this.prisma.$transaction(async (tx) => {
      let cumulativeDelayMs = 0; // начинаем с 0
  
      for (const [index, tmpl] of templates.entries()) {
        // Каждое письмо — +1 минута от предыдущего
        const delayFromPrev = index === 0 
          ? 1 * 60 * 1000   // первое — через 1 минуту
          : 1 * 60 * 1000;  // все остальные — +1 минута
  
        cumulativeDelayMs += delayFromPrev;
  
        const scheduledAt = new Date(Date.now() + cumulativeDelayMs);
  
        const dbJob = await tx.emailJob.create({
          data: {
            userUuid,
            templateId: tmpl.id,
            quizId: rootQuizId,
            chainType,
            quizCountAtStart,
            status: 'pending',
            scheduledAt,
            rootQuizId: index === 0 ? rootQuizId : null,
            mergeWindowExpiresAt: index === 0 ? windowExpiresAt : null,
          },
        });
  
        await this.emailQueue.add(
          'send-followup',
          {
            email,
            templateId: tmpl.id,
            userUuid,
            step: tmpl.step,
            chainType,
            quizCountAtStart,
            sequenceId: tmpl.sequenceId,
            geo,
            quizId: rootQuizId,
            jobDbId: dbJob.id,
          },
          {
            delay: cumulativeDelayMs,
            attempts: 3,
            backoff: { type: 'fixed', delay: 5000 },
            jobId: `${chainType[0].toLowerCase()}-${userUuid}-${rootQuizId}-${tmpl.step}-${Date.now()}`,
          },
        );
  
        this.logger.log(`${chainType} → dbId=${dbJob.id} | ${tmpl.subject} | +${cumulativeDelayMs / 1000}s (step ${tmpl.step})`);
      }
    });
  }
  
  private async startGeneralChain(params: {
    userUuid: string;
    email: string;
    geo: string;
    quizCountAtStart: number;
    rootQuizId: number;
    windowExpiresAt: Date;
  }) {
    const { userUuid, email, geo, quizCountAtStart, rootQuizId, windowExpiresAt } = params;
  
    const templates = await this.prisma.emailTemplate.findMany({
      where: {
        geo: geo,
        quizId: null,  // ← только общие
      },
      orderBy: { step: 'asc' },
    });
  
    if (templates.length === 0) {
      this.logger.warn(`GENERAL шаблоны НЕ НАЙДЕНЫ для geo=${geo}`);
      return;
    }
  
    // Удаляем старые PERSONAL
    await this.prisma.emailJob.deleteMany({
      where: { userUuid, rootQuizId, chainType: 'PERSONAL', status: 'pending' },
    });
  
    await this.createChainJobs(
      userUuid,
      email,
      rootQuizId,
      geo,
      windowExpiresAt,
      templates,
      'GENERAL',
      { quizCountAtStart, rootQuizId }
    );
  }
}