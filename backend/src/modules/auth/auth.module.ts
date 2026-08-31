import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AccountController } from './account.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AccountController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
