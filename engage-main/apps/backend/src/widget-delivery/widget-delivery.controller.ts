import { Controller, Post, Body, Headers, Request } from '@nestjs/common';
import { WidgetDeliveryService } from './widget-delivery.service';

@Controller('widget-delivery')
export class WidgetDeliveryController {
  constructor(private widgetDeliveryService: WidgetDeliveryService) {}

  @Post('init')
  async initWidget(
    @Body('appId') appId: string,
    @Body('visitorId') visitorId: string,
    @Headers('user-agent') userAgent: string,
    @Request() req: any
  ) {
    // Get client IP address
    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    return this.widgetDeliveryService.initWidget(appId, userAgent, ipAddress, visitorId);
  }
}
