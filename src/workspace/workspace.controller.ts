import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { InterestDto, ReviewRejectDto, SellDto, SendOffersDto } from './dto.js';
import { WorkflowService } from './workflow.service.js';

@Controller()
export class WorkspaceController {
  constructor(private readonly workflow: WorkflowService) {}

  @Roles('broker')
  @HttpCode(200)
  @Post('requests/:id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.submit(user, id);
  }

  @Roles('admin')
  @HttpCode(200)
  @Post('requests/:id/approve')
  approveRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.approveRequest(user, id);
  }

  @Roles('admin')
  @HttpCode(200)
  @Post('requests/:id/reject')
  rejectRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewRejectDto,
  ) {
    return this.workflow.rejectRequest(user, id, dto.reason);
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
  @Post('offers/:id/approve')
  approveOffer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.approveOffer(user, id);
  }

  /** Admin review rejection; `offers/:id/reject` is the broker's "not a fit". */
  @Roles('admin')
  @HttpCode(200)
  @Post('offers/:id/decline')
  declineOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewRejectDto,
  ) {
    return this.workflow.declineOffer(user, id, dto.reason);
  }

  @Roles('partner')
  @HttpCode(200)
  @Post('offers/:id/resubmit')
  resubmitOffer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.resubmitOffer(user, id);
  }

  @Roles('admin')
  @HttpCode(200)
  @Post('transfers/:id/return')
  returnTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewRejectDto,
  ) {
    return this.workflow.returnTransfer(user, id, dto.reason);
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
  @Post('events/read-all')
  readAllEvents(@CurrentUser() user: AuthUser) {
    return this.workflow.markAllEventsRead(user);
  }

  @HttpCode(200)
  @Post('events/:id/read')
  readEvent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.markEventRead(user, id);
  }
}
