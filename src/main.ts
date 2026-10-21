import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './config/app-setup';
import { setupSwagger } from './config/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const configService = app.get(ConfigService);
  if (configService.getOrThrow<boolean>('SWAGGER_ENABLED')) {
    setupSwagger(app);
  }
  await app.listen(configService.getOrThrow<number>('PORT'));
}
void bootstrap();
