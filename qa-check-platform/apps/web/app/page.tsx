export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-6">
          <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-xl font-bold text-white">✓</span>
          <span className="text-lg font-semibold tracking-tight">QA Check Platform</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-24 sm:py-32">
        <section className="max-w-3xl">
          <p className="mb-6 text-sm font-semibold uppercase tracking-widest text-indigo-600">A foundation for better software</p>
          <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-7xl">QA Check Platform</h1>
          <p className="mt-8 text-2xl leading-relaxed text-slate-600 sm:text-3xl">Automated Quality Assurance for Development Teams</p>
          <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-indigo-500" />Platform foundation · In development
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 px-6 py-6 text-center text-sm text-slate-500">Built for teams that care about quality.</footer>
    </div>
  );
}
