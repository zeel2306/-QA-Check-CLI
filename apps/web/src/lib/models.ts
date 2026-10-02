export type Outcome = 'Passed' | 'Warning' | 'Failed';
export type Severity = 'Critical' | 'Error' | 'Warning' | 'Info';
export interface Project {id:string; name:string; description:string; url:string; repository:string; framework:string; environment:string; branch:string; score:number|null; previous:number|null; errors:number; warnings:number; lastRun:string; color:string}
export interface Run {id:string; number:number; projectId:string; project:string; branch:string; commit:string; environment:string; score:number; previous:number|null; status:Outcome; duration:string; date:string; passed:number; warnings:number; errors:number; categories:Record<string,number>}
export interface Issue {id:string; title:string; projectId:string; project:string; category:string; severity:Severity; route:string; selector:string; status:'Open'|'Resolved'|'Ignored'|'Accepted'; change:'New'|'Existing'|'Fixed'|'Regressed'; expected:string; actual:string; fix:string; firstSeen:string; lastSeen:string}
export interface CloudData {projects:Project[];runs:Run[];issues:Issue[]}
