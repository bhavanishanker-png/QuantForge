import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { api, errorMessage, unwrap } from '@/lib/api';
import { useSession } from '@/stores/session';
import { AuthLayout } from './AuthLayout';
import { Field } from './Field';
import { type RegisterValues, registerSchema } from './schemas';

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await unwrap(api.POST('/api/v1/auth/register', { body: values }));
      setSession(res.accessToken, res.user);
      navigate('/', { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <AuthLayout
      title="Create your account"
      description="You'll get a personal workspace to start researching."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-foreground underline underline-offset-4">
            Sign in
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
        <Field id="displayName" label="Name" autoComplete="name" error={errors.displayName?.message} {...form.register('displayName')} />
        <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          placeholder="At least 12 characters"
          {...form.register('password')}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
