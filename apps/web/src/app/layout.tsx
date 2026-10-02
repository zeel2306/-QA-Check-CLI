import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
export const metadata: Metadata = { title: {default:'QA Check Cloud — Ship with confidence', template:'%s · QA Check Cloud'}, description:'Your web quality, in one place. Track QA scores, compare runs, and fix what matters.', icons:{icon:'/favicon.svg'} };
export default function Layout({children}:{children:React.ReactNode}) {
  const content = <html lang="en"><body>{children}</body></html>;
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY ? <ClerkProvider>{content}</ClerkProvider> : content;
}
