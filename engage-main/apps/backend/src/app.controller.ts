import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Indiquer Engage Backend API',
    };
  }

  @Get()
  getIndex() {
    return {
      message: 'Welcome to Indiquer Engage API',
      version: '1.0.0',
    };
  }
}
