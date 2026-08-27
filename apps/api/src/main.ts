import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ credentials: true, origin: true });
  app.use(cookieParser());
  // Health check stays unprefixed for infra probes / load balancers.
  app.setGlobalPrefix('api/v1', { exclude: ['/', 'health'] });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
