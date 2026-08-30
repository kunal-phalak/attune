'use server';

import { redirect } from 'next/navigation';

import { getNeonAuth } from '../lib/auth/neon';

function credentials(formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');
  if (typeof email !== 'string' || !email.includes('@')) redirect('/sign-in?error=invalid');
  if (typeof password !== 'string' || password.length < 8) redirect('/sign-in?error=invalid');
  return { email, password };
}

export async function signIn(formData: FormData) {
  const result = await getNeonAuth().signIn.email(credentials(formData));
  if (result.error) redirect('/sign-in?error=credentials');
  redirect('/dashboard');
}

export async function signUp(formData: FormData) {
  const input = credentials(formData);
  const name = formData.get('name');
  if (typeof name !== 'string' || name.trim().length < 2) redirect('/sign-up?error=invalid');
  const result = await getNeonAuth().signUp.email({ ...input, name: name.trim() });
  if (result.error) redirect('/sign-up?error=registration');
  redirect('/dashboard');
}
