import { Module } from '@nestjs/common';
import { InsightsService } from './insights.service.js';
import { ListsController } from './lists.controller.js';
import { ListsService } from './lists.service.js';
import { RecordsController } from './records.controller.js';
import { RecordsService } from './records.service.js';
import { SlicesService } from './slices.service.js';
import { WorkflowService } from './workflow.service.js';
import { WorkspaceController } from './workspace.controller.js';

@Module({
  controllers: [WorkspaceController, RecordsController, ListsController],
  providers: [
    WorkflowService,
    RecordsService,
    SlicesService,
    ListsService,
    InsightsService,
  ],
})
export class WorkspaceModule {}
