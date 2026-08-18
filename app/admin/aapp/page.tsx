'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AAPPPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/aapp/cnmc'); }, [router]);
  return (
    <div className="p-8 text-center text-gray-500">
      <p>Redirigiendo a CNMC...</p>
    </div>
  );
}
