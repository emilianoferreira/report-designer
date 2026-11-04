import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (process.env.JSON_BODY_LIMIT) app.useBodyParser('json', { limit: process.env.JSON_BODY_LIMIT });

  // Enable CORS for Angular dev server
  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Zureo API running on http://localhost:${port}`);
}
bootstrap();
