import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma/prisma.module';
import { EmailsModule } from './emails/emails.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: '194.36.179.168',
        port: 6379,
        password: 'nano',
      },
    }),
    PrismaModule,
    EmailsModule,
  ],
})
export class AppModule {}