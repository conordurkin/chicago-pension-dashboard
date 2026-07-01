import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/funds/aggregate', label: 'Funds' },
  { href: '/history', label: 'History' },
  { href: '/scenarios', label: 'Scenarios' },
  { href: '/burden', label: 'Impact' },
  { href: '/methodology', label: 'Methodology' },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
          <a
            href="https://acitythatworks.org"
            className="text-slate-900 transition hover:text-slate-600"
          >
            A City That Works
          </a>
          <span className="text-slate-300" aria-hidden="true">
            ·
          </span>
          <Link href="/" className="text-slate-900 transition hover:text-slate-600">
            Chicago Pension Dashboard
          </Link>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-1.5 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
