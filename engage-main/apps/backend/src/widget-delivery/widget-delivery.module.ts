import { Module } from '@nestjs/common';
import { WidgetDeliveryService } from './widget-delivery.service';
import { WidgetDeliveryController } from './widget-delivery.controller';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [WidgetDeliveryController],
  providers: [WidgetDeliveryService, PrismaService],
  exports: [WidgetDeliveryService],
})
export class WidgetDeliveryModule {}
