import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { InterestDto, SellDto, SendOffersDto } from './dto.js';
import { WorkflowService } from './workflow.service.js';
import { WorkspaceService } from './workspace.service.js';

/** Every mutation responds with the caller's refreshed workspace snapshot. */
@Controller()
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly workflow: WorkflowService,
  ) {}

  @Get('workspace')
  snapshot(@CurrentUser() user: AuthUser) {
    return this.workspace.snapshot(user);
  }

  @Roles('broker')
  @HttpCode(200)
  @Post('requests/:id/start')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.start(user, id);
  }

  @Roles('broker')
  @HttpCode(200)
  @Post('requests/:id/transfer')
  transfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.transfer(user, id);
  }

  @Roles('partner')
  @HttpCode(200)
  @Post('requests/:id/drafts/:propertyId/toggle')
  toggleDraft(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.workflow.toggleDraft(user, id, propertyId);
  }

  @Roles('partner')
  @HttpCode(200)
  @Post('requests/:id/offers')
  sendOffers(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendOffersDto,
  ) {
    return this.workflow.sendOffers(user, id, dto.propertyIds);
  }

  @Roles('broker')
  @HttpCode(200)
  @Post('offers/:id/interest')
  interest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: InterestDto,
  ) {
    return this.workflow.setInterest(user, id, dto.selected);
  }

  @Roles('broker')
  @HttpCode(200)
  @Post('offers/:id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.setDisposition(user, id, 'rejected');
  }

  @Roles('broker')
  @HttpCode(200)
  @Post('offers/:id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.setDisposition(user, id, 'neutral');
  }

  @Roles('admin')
  @HttpCode(200)
  @Post('transfers/:id/return')
  returnTransfer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.returnTransfer(user, id);
  }

  @Roles('admin')
  @HttpCode(200)
  @Post('transfers/:id/sell')
  sell(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SellDto,
  ) {
    return this.workflow.sell(user, id, dto.propertyId);
  }

  @HttpCode(200)
  @Post('events/:id/read')
  readEvent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.markEventRead(user, id);
  }
}
