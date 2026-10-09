import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // a bulk import of 200 invoices is larger than the 100kb default
  app.useBodyParser('json', { limit: '1mb' });
  const config = app.get(ConfigService);

  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',') : true,
  });

  configureApp(app);
  setupSwagger(app);
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`API running on port ${port}, docs at /api/docs`, 'Bootstrap');
}

void bootstrap();
