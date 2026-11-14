import { applyDecorators, createParamDecorator, type ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiSecurity } from '@nestjs/swagger';
import { WorkspaceGuard } from './workspace.guard.js';

export * from './metadata.js';
import { type AuthedRequest, IS_PUBLIC, WORKSPACE_SCOPE, type WorkspaceScopeOptions } from './metadata.js';

/** Route needs no access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires membership of the workspace with at least `minRole` (API_DESIGN.md §1). */
export function WorkspaceScoped(opts: WorkspaceScopeOptions) {
  const decorators = [SetMetadata(WORKSPACE_SCOPE, opts), UseGuards(WorkspaceGuard), ApiBearerAuth()];
  if ((opts.source ?? 'header') === 'header') {
    // Modelled as a security scheme (not a per-call parameter): the client injects it once.
    decorators.push(ApiSecurity('workspace'));
  } else {
    decorators.push(ApiParam({ name: 'workspaceId', format: 'uuid', description: 'Workspace UUID' }));
  }
  return applyDecorators(...decorators);
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);

export const CurrentWorkspace = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const ws = ctx.switchToHttp().getRequest<AuthedRequest>().workspace;
  if (!ws) throw new Error('CurrentWorkspace used on a route without @WorkspaceScoped');
  return ws;
});
