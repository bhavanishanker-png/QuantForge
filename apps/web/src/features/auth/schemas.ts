import { z } from 'zod';

// Mirrors the API's RegisterDto/LoginDto rules so users get instant feedback; the server re-validates.
export const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password').max(128),
});

export const registerSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.email('Enter a valid email').max(254),
  password: z.string().min(12, 'Use at least 12 characters').max(128),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
