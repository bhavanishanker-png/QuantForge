import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { registerSchema } from './schemas';

function renderLogin() {
  const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], { initialEntries: ['/login'] });
  return render(<RouterProvider router={router} />);
}

describe('LoginPage', () => {
  it('shows field errors and does not call the API when the form is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the server error message for wrong credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });
});

describe('registerSchema', () => {
  it('mirrors the API rules', () => {
    expect(registerSchema.safeParse({ displayName: 'A', email: 'a@b.test', password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ displayName: ' ', email: 'a@b.test', password: 'long-enough-pass' }).success).toBe(false);
    expect(registerSchema.safeParse({ displayName: 'A', email: 'a@b.test', password: 'long-enough-pass' }).success).toBe(true);
  });
});
