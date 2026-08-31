import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { serve } from 'inngest/express';
import { env } from './config/env.js';
import { functions, inngest } from './inngest/client.js';

export function configureApp(app: INestApplication) {
  app.enableCors({
    origin: env.FRONTEND_URL.split(',').map((value) => value.trim()),
    credentials: true,
  });
  app.use(cookieParser());
  app.use('/api/inngest', serve({ client: inngest, functions }));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ContextFlow API')
    .setDescription('JWT, workspace, project, collaboration and AI endpoints for ContextFlow.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}
