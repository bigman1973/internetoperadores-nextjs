'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function ConciliacionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const tabs = [
    { name: 'Automática', href: '/admin/finanzas/conciliacion' },
    { name: 'Manual', href: '/admin/finanzas/conciliacion/manual' },
  ];

  return (
    <div>
      {/* Tabs de navegación */}
      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((tab) => {
            const isActive = tab.href === '/admin/finanzas/conciliacion' 
              ? pathname === '/admin/finanzas/conciliacion'
              : pathname?.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-purple-600 text-purple-700 bg-purple-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
