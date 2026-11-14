import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
  CurrentWorkspace,
  type WorkspaceCtx,
  WorkspaceScoped,
} from '../common/auth/decorators.js';
import { OffsetQuery } from '../common/http/pagination.js';
import {
  AddMemberDto,
  CreateWorkspaceDto,
  MemberDto,
  UpdateMemberDto,
  UpdateWorkspaceDto,
  WorkspaceDto,
  WorkspacePageDto,
} from './dto.js';
import { WorkspacesService } from './workspaces.service.js';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOkResponse({ type: WorkspacePageDto })
  list(@CurrentUser() user: AuthUser, @Query() q: OffsetQuery) {
    return this.workspaces.listMine(user, q.page, q.pageSize);
  }

  @Post()
  @ApiCreatedResponse({ type: WorkspaceDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user, dto.name);
  }

  @Get(':workspaceId')
  @WorkspaceScoped({ minRole: 'VIEWER', source: 'param' })
  @ApiOkResponse({ type: WorkspaceDto })
  get(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx) {
    return this.workspaces.get(user, ws);
  }

  @Patch(':workspaceId')
  @WorkspaceScoped({ minRole: 'ADMIN', source: 'param' })
  @ApiOkResponse({ type: WorkspaceDto })
  rename(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.rename(user, ws, dto.name);
  }

  @Get(':workspaceId/members')
  @WorkspaceScoped({ minRole: 'VIEWER', source: 'param' })
  @ApiOkResponse({ type: [MemberDto] })
  members(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx) {
    return this.workspaces.listMembers(user, ws);
  }

  @Post(':workspaceId/members')
  @WorkspaceScoped({ minRole: 'ADMIN', source: 'param' })
  @ApiCreatedResponse({ type: MemberDto })
  addMember(@CurrentUser() user: AuthUser, @CurrentWorkspace() ws: WorkspaceCtx, @Body() dto: AddMemberDto) {
    return this.workspaces.addMember(user, ws, dto);
  }

  @Patch(':workspaceId/members/:userId')
  @WorkspaceScoped({ minRole: 'ADMIN', source: 'param' })
  @ApiOkResponse({ type: MemberDto })
  updateMember(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceCtx,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.workspaces.updateMemberRole(user, ws, userId, dto.role);
  }

  @Delete(':workspaceId/members/:userId')
  @HttpCode(204)
  @WorkspaceScoped({ minRole: 'ADMIN', source: 'param' })
  @ApiNoContentResponse()
  removeMember(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceCtx,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.workspaces.removeMember(user, ws, userId);
  }
}
