import { z } from 'zod';

const emailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase());
const passwordSchema = z.string().refine((password) => {
  const characterCount = Array.from(password).length;
  return characterCount >= 15 && characterCount <= 128;
}, 'Password must contain 15 to 128 characters.');

export const registrationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().max(120).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const logoutSchema = z.object({}).strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
