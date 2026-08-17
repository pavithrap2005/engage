import { Module } from '@nestjs/common';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PublicApiController],
  providers: [PublicApiService, PrismaService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
