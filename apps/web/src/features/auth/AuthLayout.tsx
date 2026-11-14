import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuthLayout({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 text-foreground">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">QuantForge</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </main>
  );
}

export function Logo({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 17l5-6 4 4 8-10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 21h18" strokeLinecap="round" />
    </svg>
  );
}
