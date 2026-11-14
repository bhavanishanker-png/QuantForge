import type { Member, WorkspaceRole } from '@quantforge/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/app/States';
import { PageHeader } from '@/components/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, errorMessage, unwrap } from '@/lib/api';
import { qk } from '@/lib/query';
import { useSession } from '@/stores/session';
import { can, useCurrentWorkspace } from './hooks';

const ROLES: { value: WorkspaceRole; label: string; hint: string }[] = [
  { value: 'VIEWER', label: 'Viewer', hint: 'Read everything' },
  { value: 'DEVELOPER', label: 'Developer', hint: 'Run research and jobs' },
  { value: 'ADMIN', label: 'Admin', hint: 'Manage members and settings' },
  { value: 'OWNER', label: 'Owner', hint: 'Full control, including owners' },
];

export function SettingsPage() {
  const { workspace } = useCurrentWorkspace();
  if (!workspace) return <Skeleton className="h-40" />;
  return (
    <>
      <PageHeader title="Settings" description="Workspace details and members." />
      <div className="space-y-6">
        <GeneralCard key={`${workspace.id}:${workspace.name}`} workspaceId={workspace.id} name={workspace.name} canEdit={can(workspace.role, 'ADMIN')} />
        <MembersCard workspaceId={workspace.id} myRole={workspace.role} />
      </div>
    </>
  );
}

function GeneralCard({ workspaceId, name, canEdit }: { workspaceId: string; name: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(name);
  const rename = useMutation({
    mutationFn: () => unwrap(api.PATCH('/api/v1/workspaces/{workspaceId}', { params: { path: { workspaceId } }, body: { name: value.trim() } })),
    onSuccess: () => {
      toast.success('Workspace renamed');
      return qc.invalidateQueries({ queryKey: qk.workspaces });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">General</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-md items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rename.mutate();
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input id="ws-name" value={value} maxLength={80} disabled={!canEdit} onChange={(e) => setValue(e.target.value)} />
          </div>
          {canEdit && (
            <Button type="submit" disabled={!value.trim() || value.trim() === name || rename.isPending}>
              Save
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function MembersCard({ workspaceId, myRole }: { workspaceId: string; myRole: WorkspaceRole }) {
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const isAdmin = can(myRole, 'ADMIN');
  const members = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => unwrap(api.GET('/api/v1/workspaces/{workspaceId}/members', { params: { path: { workspaceId } } })),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: qk.members(workspaceId) });
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: WorkspaceRole }) =>
      unwrap(api.PATCH('/api/v1/workspaces/{workspaceId}/members/{userId}', { params: { path: { workspaceId, userId: v.userId } }, body: { role: v.role } })),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      unwrap(api.DELETE('/api/v1/workspaces/{workspaceId}/members/{userId}', { params: { path: { workspaceId, userId } } })),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Admins can't change or remove owners, and only owners can grant the owner role (enforced server-side too).
  const editable = (m: Member) => isAdmin && (myRole === 'OWNER' || m.role !== 'OWNER');
  const roleOptions = myRole === 'OWNER' ? ROLES : ROLES.filter((r) => r.value !== 'OWNER');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Members</CardTitle>
        <CardDescription>People with access to this workspace. Changes take effect immediately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && <AddMemberForm workspaceId={workspaceId} roleOptions={roleOptions} onAdded={refresh} />}
        {members.isPending ? (
          <Skeleton className="h-24" />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="w-44">Role</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>
                    <div className="font-medium">
                      {m.displayName}
                      {m.userId === me?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    {editable(m) ? (
                      <Select
                        value={m.role}
                        items={roleOptions}
                        onValueChange={(role) => role && changeRole.mutate({ userId: m.userId, role: role as WorkspaceRole })}
                      >
                        <SelectTrigger className="w-36" aria-label={`Role for ${m.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">{ROLES.find((r) => r.value === m.role)?.label}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editable(m) && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.email}`} onClick={() => remove.mutate(m.userId)}>
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AddMemberForm({ workspaceId, roleOptions, onAdded }: { workspaceId: string; roleOptions: typeof ROLES; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('DEVELOPER');
  const add = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/workspaces/{workspaceId}/members', { params: { path: { workspaceId } }, body: { email: email.trim(), role } })),
    onSuccess: () => {
      toast.success(`Added ${email.trim()}`);
      setEmail('');
      onAdded();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="member-email">Add an existing QuantForge user</Label>
        <Input id="member-email" type="email" placeholder="teammate@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Select value={role} items={roleOptions} onValueChange={(v) => v && setRole(v as WorkspaceRole)}>
        <SelectTrigger className="w-36" aria-label="Role for new member">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={!email.trim() || add.isPending}>
        <UserPlus /> Add
      </Button>
    </form>
  );
}
