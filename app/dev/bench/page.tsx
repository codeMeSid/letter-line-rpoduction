import { notFound } from 'next/navigation';
import BenchClient from './BenchClient';

export default function BenchPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <BenchClient />;
}
