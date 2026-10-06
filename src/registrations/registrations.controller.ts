import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import {
  RegistrationsQueryDto,
  RejectRegistrationDto,
} from './registrations.dto.js';
import { RegistrationsService } from './registrations.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@Roles('admin')
@Controller('registration-requests')
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get()
  list(@Query() query: RegistrationsQueryDto) {
    return this.registrations.list(query);
  }

  @Get(':id')
  detail(@Param('id', uuid) id: string) {
    return this.registrations.detail(id);
  }

  @HttpCode(200)
  @Post(':id/approve')
  approve(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string) {
    return this.registrations.approve(admin, id);
  }

  @HttpCode(200)
  @Post(':id/reject')
  reject(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RejectRegistrationDto,
  ) {
    return this.registrations.reject(admin, id, dto);
  }
}
