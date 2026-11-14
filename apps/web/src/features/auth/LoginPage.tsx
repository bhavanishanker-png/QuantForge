import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage, unwrap } from '@/lib/api';
import { useSession } from '@/stores/session';
import { AuthLayout } from './AuthLayout';
import { Field } from './Field';
import { type LoginValues, loginSchema } from './schemas';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useSession((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await unwrap(api.POST('/api/v1/auth/login', { body: values }));
      setSession(res.accessToken, res.user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back to your research workspace."
      footer={
        <>
          New to QuantForge?{' '}
          <Link to="/register" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...form.register('password')} />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
