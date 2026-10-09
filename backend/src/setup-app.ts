import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Global app setup. Kept separate from main.ts so the e2e tests
 * build the app exactly the same way.
 */
export function configureApp(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SimpleInvoice API')
    .setDescription('Invoices API for the SimpleInvoice app')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
