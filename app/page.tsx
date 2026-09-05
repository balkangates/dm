import { Suspense } from 'react';
import StoreSelector from '@/components/StoreSelector';

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <Suspense fallback={null}>
        <StoreSelector />
      </Suspense>
    </main>
  );
}
