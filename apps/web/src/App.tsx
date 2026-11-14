import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { GuestOnly, RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { JobsPage } from '@/features/jobs/JobsPage';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { ComingSoonPage } from '@/features/placeholder/ComingSoonPage';
import { SettingsPage } from '@/features/workspaces/SettingsPage';
import { AppShell } from '@/layouts/AppShell';
import { NAV } from '@/layouts/nav';

const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'jobs', element: <JobsPage /> },
          { path: 'settings', element: <SettingsPage /> },
          ...NAV.filter((n) => n.phase).map((n) => ({ path: n.to.slice(1), element: <ComingSoonPage item={n} /> })),
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
