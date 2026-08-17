import { Module } from '@nestjs/common';
import { VisitorController } from './visitor.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [VisitorController],
  providers: [PrismaService],
})
export class VisitorModule {}
