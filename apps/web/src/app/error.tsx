'use client';
export default function Error({reset}:{reset:()=>void}){return <main className="page-error"><h1>We couldn’t load this page.</h1><p>Check your connection and service configuration, then try again. Your local QA reports are safe.</p><button className="button primary" onClick={reset}>Try again</button></main>}
