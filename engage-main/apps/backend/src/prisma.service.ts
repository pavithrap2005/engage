import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'path';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || dbUrl === 'file:./dev.db' || dbUrl === 'file:./prisma/dev.db') {
      const dbPath = join(process.cwd(), 'prisma', 'dev.db').replace(/\\/g, '/');
      dbUrl = `file:${dbPath}`;
    }
    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
