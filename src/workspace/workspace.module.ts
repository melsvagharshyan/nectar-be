import { Module } from '@nestjs/common';
import { RecordsController } from './records.controller.js';
import { RecordsService } from './records.service.js';
import { WorkflowService } from './workflow.service.js';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceService } from './workspace.service.js';

@Module({
  controllers: [WorkspaceController, RecordsController],
  providers: [WorkspaceService, WorkflowService, RecordsService],
})
export class WorkspaceModule {}
