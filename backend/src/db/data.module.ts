import { Global, Module } from '@nestjs/common';
import { AppStore } from './app-store.js';

@Global()
@Module({ providers: [AppStore], exports: [AppStore] })
export class DataModule {}
