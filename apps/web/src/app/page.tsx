import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: { absolute: 'QA Check Platform — Ship Better Software' },
  description: 'Run quality audits locally with QA Check CLI. Explore a private workspace for imported reports, projects, and quality history.',
};

export default function Page() { return <LandingPage />; }
