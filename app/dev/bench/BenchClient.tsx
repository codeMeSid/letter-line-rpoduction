'use client';

import dynamic from 'next/dynamic';

const Bench = dynamic(() => import('@/components/Bench'), { ssr: false });

export default function BenchClient() {
  return <Bench />;
}
