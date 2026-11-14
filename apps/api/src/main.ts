import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { buildOpenApi, configureApp } from './bootstrap.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
configureApp(app);
const config = app.get(ConfigService<Env, true>);
if (config.get('NODE_ENV') !== 'production') {
  SwaggerModule.setup('api/docs', app, () => buildOpenApi(app));
}
await app.listen(config.get('PORT'), '0.0.0.0');
