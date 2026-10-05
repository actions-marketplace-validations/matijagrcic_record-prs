import { useEffect, useState } from 'react'
import { ArrowUpRight, GitPullRequest, FolderKanban, Users, GalleryVerticalEnd } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { LoginForm } from '@/components/login-form'
import { SignupForm } from '@/components/signup-form'
import { SignDocumentPage } from '@/components/sign-document-page'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'

function Dashboard({projects = false}: {projects?: boolean}) {
  return <div className="mx-auto w-full max-w-6xl space-y-8 p-6 lg:p-10" data-testid={projects ? 'projects-page' : 'overview-page'}>
    <div className="flex items-start justify-between"><div><p className="mb-2 text-sm text-muted-foreground">Acme Studio / Workspace</p><h1 className="text-3xl font-semibold tracking-tight">{projects ? 'Projects' : 'Workspace overview'}</h1><p className="mt-2 text-muted-foreground">A clear view of what your team is building.</p></div><Button asChild variant="outline"><a href="#/projects">View projects <ArrowUpRight/></a></Button></div>
    <div className="grid gap-4 md:grid-cols-3">{[{title:'Active projects',value:'12',icon:FolderKanban,note:'3 ready for review'},{title:'Open pull requests',value:'24',icon:GitPullRequest,note:'8 updated today'},{title:'Team members',value:'6',icon:Users,note:'Across 2 workspaces'}].map(stat => <Card key={stat.title}><CardHeader className="flex flex-row items-center justify-between"><CardDescription>{stat.title}</CardDescription><stat.icon className="size-4 text-muted-foreground"/></CardHeader><CardContent><p className="text-3xl font-semibold">{stat.value}</p><p className="mt-2 text-sm text-muted-foreground">{stat.note}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Recent projects</CardTitle><CardDescription>Keep your next release moving.</CardDescription></CardHeader><CardContent className="divide-y">{[{name:'Customer dashboard',detail:'Navigation and account screens',status:'In progress'},{name:'Design system',detail:'Reusable components for every team',status:'Ready for review'},{name:'Developer portal',detail:'Documentation and onboarding',status:'In progress'}].map(project => <div key={project.name} className="flex items-center justify-between py-5"><div><p className="font-medium">{project.name}</p><p className="mt-1 text-sm text-muted-foreground">{project.detail}</p></div><Badge variant="secondary">{project.status}</Badge></div>)}</CardContent></Card>
    <p className="text-sm text-muted-foreground">Built with shadcn/ui · A sample workspace for testing PR recordings.</p>
  </div>
}

export default function App() {
  const [route,setRoute] = useState(window.location.hash.slice(1) || '/')
  useEffect(() => { const change = () => setRoute(window.location.hash.slice(1) || '/'); window.addEventListener('hashchange',change); return () => window.removeEventListener('hashchange',change) },[])
  if (route === '/login' || route === '/signup') return <TooltipProvider><main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6" data-testid={`${route.slice(1)}-page`}>
    <a href="#/" className="flex items-center gap-2 font-medium"><GalleryVerticalEnd className="size-5"/>Acme Studio</a>
    <div className="w-full max-w-sm">{route === '/login' ? <LoginForm/> : <SignupForm/>}</div>
    <a href="#/" className="text-sm text-muted-foreground underline">Back to workspace</a>
    <p className="text-xs text-muted-foreground">Demo only. No account is created or authenticated.</p>
  </main></TooltipProvider>
  return <TooltipProvider><SidebarProvider><AppSidebar route={route}/><SidebarInset>
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-6"><SidebarTrigger data-testid="sidebar-toggle"/><Separator orientation="vertical" className="h-4"/><span className="text-sm text-muted-foreground">Workspace</span><span className="text-sm">/ {route === '/sign-document' ? 'Sign document' : route === '/projects' ? 'Projects' : 'Overview'}</span><Badge variant="outline" className="ml-auto">Demo</Badge></header>
    {route === '/sign-document' ? <SignDocumentPage/> : <Dashboard projects={route === '/projects'}/>}
  </SidebarInset></SidebarProvider></TooltipProvider>
}
