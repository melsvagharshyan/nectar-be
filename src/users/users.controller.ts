import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { BlockUserDto } from './users.dto.js';
import { UsersService } from './users.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@Roles('admin')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('companies/:id/accounts')
  companyAccounts(@Param('id') companyId: string) {
    return this.users.companyAccounts(companyId);
  }

  @HttpCode(200)
  @Post('users/:id/block')
  block(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.users.block(admin, id, dto);
  }

  @HttpCode(200)
  @Post('users/:id/unblock')
  unblock(@Param('id', uuid) id: string) {
    return this.users.unblock(id);
  }
}
