import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/stores/session';
import { useCreateWorkspace, useCurrentWorkspace, useWorkspaces } from './hooks';

export function WorkspaceSwitcher() {
  const { data } = useWorkspaces();
  const { workspace } = useCurrentWorkspace();
  const setWorkspace = useSession((s) => s.setWorkspace);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="w-full justify-between" aria-label="Switch workspace">
              <span className="truncate">{workspace?.name ?? 'Loading…'}</span>
              <ChevronsUpDown className="opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {data?.items.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => setWorkspace(w.id)}>
                <span className="flex-1 truncate">{w.name}</span>
                <span className="text-xs text-muted-foreground">{w.role.toLowerCase()}</span>
                {w.id === workspace?.id && <Check />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <Plus /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('');
  const create = useCreateWorkspace();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync(name.trim());
    setName('');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>Workspaces keep strategies, data and experiments separate. You'll be its owner.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input id="ws-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            {create.error && <p className="text-xs text-destructive">{errorMessage(create.error)}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
