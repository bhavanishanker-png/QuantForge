import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { type AuthUser, CurrentUser, CurrentWorkspace, type WorkspaceCtx, WorkspaceScoped } from '../common/auth/decorators.js';
import { JobRefDto } from '../jobs/dto.js';
import { JobsService } from '../jobs/jobs.service.js';

export class PingJobDto {
  @ApiPropertyOptional({ type: Number, default: 3, minimum: 0, maximum: 60, description: 'Seconds the job should run' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(60)
  durationSec = 3;
}

@ApiTags('system')
@Controller({ path: 'system', version: '1' })
export class SystemController {
  constructor(private readonly jobs: JobsService) {}

  /** Diagnostic job that exercises the whole pipeline (outbox → dispatcher → Celery → Socket.IO). */
  @Post('ping-job')
  @HttpCode(202)
  @WorkspaceScoped({ minRole: 'DEVELOPER' })
  @ApiAcceptedResponse({ type: JobRefDto })
  ping(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx, @Body() dto: PingJobDto) {
    return this.jobs.enqueue(user, ws, { type: 'system.ping', payload: { durationSec: dto.durationSec } });
  }
}
