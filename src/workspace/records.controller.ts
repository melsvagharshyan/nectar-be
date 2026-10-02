import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import {
  ClientDto,
  CompanyDto,
  EmployeeDto,
  PropertyDto,
  RequestDto,
} from './records.dto.js';
import { RecordsService } from './records.service.js';

/** Every mutation responds with the caller's refreshed workspace snapshot. */
@Controller()
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Roles('broker', 'admin')
  @Post('clients')
  createClient(@CurrentUser() user: AuthUser, @Body() dto: ClientDto) {
    return this.records.createClient(user, dto);
  }

  @Roles('broker', 'admin')
  @Patch('clients/:id')
  updateClient(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ClientDto,
  ) {
    return this.records.updateClient(user, id, dto);
  }

  @Roles('broker', 'admin')
  @Post('clients/:id/requests')
  createRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RequestDto,
  ) {
    return this.records.createRequest(user, id, dto);
  }

  @Roles('broker', 'admin')
  @Patch('requests/:id')
  updateRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RequestDto,
  ) {
    return this.records.updateRequest(user, id, dto);
  }

  @Roles('partner')
  @Post('properties')
  createProperty(@CurrentUser() user: AuthUser, @Body() dto: PropertyDto) {
    return this.records.createProperty(user, dto);
  }

  @Roles('partner', 'admin')
  @Patch('properties/:id')
  updateProperty(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PropertyDto,
  ) {
    return this.records.updateProperty(user, id, dto);
  }

  @Roles('admin')
  @Post('companies')
  createCompany(@CurrentUser() user: AuthUser, @Body() dto: CompanyDto) {
    return this.records.createCompany(user, dto);
  }

  @Patch('companies/:id')
  updateCompany(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompanyDto,
  ) {
    return this.records.updateCompany(user, id, dto);
  }

  @Post('companies/:id/employees')
  createEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EmployeeDto,
  ) {
    return this.records.createEmployee(user, id, dto);
  }

  @Patch('employees/:id')
  updateEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EmployeeDto,
  ) {
    return this.records.updateEmployee(user, id, dto);
  }
}
