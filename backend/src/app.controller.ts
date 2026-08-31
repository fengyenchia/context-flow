import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './common/auth/public.decorator.js';

@ApiTags('system')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHealth() {
    return this.appService.getHealth();
  }
}
