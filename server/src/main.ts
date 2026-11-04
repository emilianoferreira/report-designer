import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (process.env.JSON_BODY_LIMIT) app.useBodyParser('json', { limit: process.env.JSON_BODY_LIMIT });

  // Angular uses the same-origin proxy. Do not grant cross-origin credential access.

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Zureo API running on http://localhost:${port}`);
}
bootstrap();
