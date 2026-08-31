import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import express from 'express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

const server = express();
let ready: Promise<void> | undefined;

async function prepare() {
  if (!ready) {
    ready = (async () => {
      const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { logger: ['error', 'warn'] });
      configureApp(app);
      await app.init();
    })();
  }
  await ready;
}

export default async function handler(request: Request, response: Response) {
  await prepare();
  return server(request, response);
}
