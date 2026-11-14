import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/app/States';
import { PageHeader } from '@/components/app/PageHeader';
import type { NavItem } from '@/layouts/nav';

/** Honest placeholder for modules on the roadmap: no fake data (completeIdea §11.1). */
export function ComingSoonPage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.label} />
      <EmptyState icon={Construction} title={`Arrives in Phase ${item.phase}`}>
        {item.blurb} See docs/DEVELOPMENT_ROADMAP.md for the plan.
      </EmptyState>
    </>
  );
}
