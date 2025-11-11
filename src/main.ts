import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bull';

async function bootstrap() { 
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3333;
  await app.listen(port);

  // BullBoard
// === Проверка Redis ===
const emailQueue = app.get<Queue>('BullQueue_email');
try {
  await emailQueue.client.ping();
  console.log('Redis connected!');
} catch (err) {
  console.error('Redis connection failed:', err);
}

// === Bull Board ===
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
app.use('/admin/queues', serverAdapter.getRouter());


logger.log(`Application is running on: ${port}`);
}
bootstrap();
