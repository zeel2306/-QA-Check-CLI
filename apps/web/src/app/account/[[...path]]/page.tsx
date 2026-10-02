import AuthPage from '@/components/auth-page';
import {auth} from '@clerk/nextjs/server';
import {redirect} from 'next/navigation';
export default async function Page(){if(process.env.CLERK_SECRET_KEY){const {userId}=await auth();if(!userId)redirect('/login');}return <AuthPage mode="account"/>}
