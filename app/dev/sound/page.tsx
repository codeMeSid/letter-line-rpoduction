import { notFound } from 'next/navigation';
import SoundClient from './SoundClient';

export default function SoundDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <SoundClient />;
}
