import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './modules/shared/decorators/public.decorator';

@ApiTags('App')
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Liveness greeting. */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
