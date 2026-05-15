export function Footer() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-600 sm:px-6">
        <p className="mb-2">
          Historical data from the{' '}
          <a
            className="underline underline-offset-2 hover:text-slate-900"
            href="https://publicplansdata.org"
            target="_blank"
            rel="noreferrer"
          >
            Public Plans Database
          </a>
          , a project of the Center for Retirement Research at Boston College. Supplementary
          data from individual fund CAFRs and actuarial valuations.
        </p>
        <p className="text-xs text-slate-500">
          This dashboard is an independent civic project from A City That Works. It is not
          affiliated with the City of Chicago or any pension fund. See the Methodology page for
          data caveats.
        </p>
      </div>
    </footer>
  );
}
