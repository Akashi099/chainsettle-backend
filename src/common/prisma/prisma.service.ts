import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';
    super(isDev ? { log: [{ emit: 'event', level: 'query' }] } : {});

    if (isDev) {
      const threshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS ?? '100', 10);
      (this as any).$on('query', (e: { duration: number; query: string }) => {
        if (e.duration > threshold) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
