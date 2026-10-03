import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { InsightsService } from './insights.service.js';
import {
  AdminRequestFilters,
  ClientsQueryDto,
  CompaniesQueryDto,
  EventsQueryDto,
  NotificationsQueryDto,
  OffersTableQueryDto,
  PropertiesQueryDto,
  RequestsQueryDto,
} from './lists.dto.js';
import { ListsService } from './lists.service.js';

/** Paginated, role-scoped reads. Each list carries the related records it needs. */
@Controller()
export class ListsController {
  constructor(
    private readonly lists: ListsService,
    private readonly insights: InsightsService,
  ) {}

  @Get('bootstrap')
  bootstrap(@CurrentUser() user: AuthUser) {
    return this.insights.bootstrap(user);
  }

  @Get('analytics')
  analytics(@CurrentUser() user: AuthUser) {
    return this.insights.analytics(user);
  }

  @Get('stats/districts')
  districtStats(@CurrentUser() user: AuthUser) {
    return this.insights.districtStats(user);
  }

  @Roles('broker', 'admin')
  @Get('clients')
  clients(@CurrentUser() user: AuthUser, @Query() query: ClientsQueryDto) {
    return this.lists.clients(user, query);
  }

  @Roles('broker', 'admin')
  @Get('clients/:id')
  client(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lists.clientDetail(user, id);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthUser, @Query() query: RequestsQueryDto) {
    return this.lists.requests(user, query);
  }

  @Roles('admin')
  @Get('requests/table')
  requestsTable(@CurrentUser() user: AuthUser, @Query() query: AdminRequestFilters) {
    return this.lists.requestsTable(user, query);
  }

  @Get('requests/:id')
  request(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lists.requestDetail(user, id);
  }

  @Roles('partner', 'admin')
  @Get('offers/table')
  offersTable(@CurrentUser() user: AuthUser, @Query() query: OffersTableQueryDto) {
    return this.lists.offersTable(user, query);
  }

  @Get('properties')
  propertiesTable(@CurrentUser() user: AuthUser, @Query() query: PropertiesQueryDto) {
    return this.lists.propertiesTable(user, query);
  }

  @Get('properties/feed')
  propertiesFeed(@CurrentUser() user: AuthUser, @Query() query: PropertiesQueryDto) {
    return this.lists.propertiesFeed(user, query);
  }

  @Get('properties/:id')
  property(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.lists.propertyDetail(user, id);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthUser, @Query() query: NotificationsQueryDto) {
    return this.lists.notifications(user, query);
  }

  @Get('events')
  events(@CurrentUser() user: AuthUser, @Query() query: EventsQueryDto) {
    return this.lists.events(user, query.requestId);
  }

  @Roles('admin')
  @Get('companies')
  companies(@Query() query: CompaniesQueryDto) {
    return this.lists.companies(query);
  }
}
