import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static assets (widget script and test pages)
  const publicPath = existsSync(join(process.cwd(), 'public'))
    ? join(process.cwd(), 'public')
    : join(__dirname, '..', 'public');
  app.useStaticAssets(publicPath);

  // Set global route prefix
  app.setGlobalPrefix('api');

  // Configure CORS for SaaS Dashboard and Chat Widget
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configure Swagger OpenAPI Docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Indiquer Engage API')
    .setDescription('AI-Powered Customer Engagement Platform REST API & Webhook Specifications')
    .setVersion('1.0.0')
    .addTag('Public API v1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Indiquer Engage Backend listening on http://localhost:${port}/api`);
  console.log(`Interactive API Documentation available at http://localhost:${port}/api/docs`);
}
bootstrap();
