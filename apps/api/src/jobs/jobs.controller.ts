import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, CurrentWorkspace, type WorkspaceCtx, WorkspaceScoped } from '../common/auth/decorators.js';
import { JobDto, JobPageDto, ListJobsQuery } from './dto.js';
import { JobsService } from './jobs.service.js';

@ApiTags('jobs')
@Controller({ path: 'jobs', version: '1' })
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @WorkspaceScoped({ minRole: 'VIEWER' })
  @ApiOkResponse({ type: JobPageDto })
  list(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx, @Query() q: ListJobsQuery) {
    return this.jobs.list(user, ws, q);
  }

  @Get(':id')
  @WorkspaceScoped({ minRole: 'VIEWER' })
  @ApiOkResponse({ type: JobDto })
  get(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(user, ws, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @WorkspaceScoped({ minRole: 'DEVELOPER' })
  @ApiOkResponse({ type: JobDto })
  cancel(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.cancel(user, ws, id);
  }
}
