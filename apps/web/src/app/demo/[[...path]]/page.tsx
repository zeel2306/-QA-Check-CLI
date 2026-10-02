import Dashboard from '@/components/dashboard';
import {demoData} from '@/lib/demo';
import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;const [section='overview',id]=path;if(path.length>2||!['overview','projects','test-runs','issues','api-tests','e2e-tests','visual-tests','reports','team','integrations','billing','settings'].includes(section))notFound();if(id&&!['projects','test-runs'].includes(section))notFound();return <Dashboard initialData={demoData} section={section} id={id} demo/>}
