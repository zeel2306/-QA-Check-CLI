import Dashboard from '@/components/dashboard';
import {getWorkspaceData,requireWorkspace} from '@/server/workspace';
import {redirect,notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{path?:string[]}>}){if(!process.env.CLERK_SECRET_KEY||!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)redirect('/login');const workspace=await requireWorkspace();const data=await getWorkspaceData(workspace.organizationId);const {path=[]}=await params;const [section='overview',id]=path;if(path.length>2||!['overview','projects','test-runs','issues','api-tests','e2e-tests','visual-tests','reports','team','integrations','billing','settings'].includes(section))notFound();if(id&&(section==='projects'?!data.projects.some(p=>p.id===id):section==='test-runs'?!data.runs.some(r=>r.id===id):true))notFound();return <Dashboard initialData={data} section={section} id={id} demo={false}/>}
