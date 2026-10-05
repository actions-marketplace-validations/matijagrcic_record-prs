import { useState } from 'react'
import { Film, CheckCircle2, Clock, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

const recordings = [
  {name:'Workspace navigation',detail:'A tour of the sidebar and project screens',duration:'0:08',reviewed:true,route:'/projects'},
  {name:'Account onboarding',detail:'Login and signup, from start to finish',duration:'0:12',reviewed:true,route:'/signup'},
  {name:'Project overview',detail:'Explore the latest workspace activity',duration:'0:06',reviewed:false,route:'/'},
]

export function RecordingsPage() {
  const [reviewedOnly,setReviewedOnly] = useState(false)
  const visible = recordings.filter(item => !reviewedOnly || item.reviewed)
  return <div className="mx-auto w-full max-w-6xl space-y-8 p-6 lg:p-10" data-testid="recordings-page">
    <div className="flex items-start justify-between gap-4"><div><p className="mb-2 text-sm text-muted-foreground">Acme Studio / Workspace</p><h1 className="text-3xl font-semibold tracking-tight">Recordings</h1><p className="mt-2 text-muted-foreground">See what changed. Keep the proof beside the work.</p></div><Badge variant="secondary" className="mt-1">New</Badge></div>
    <div className="grid gap-4 md:grid-cols-3">{[{label:'Demo journeys',value:'3',icon:Film},{label:'Reviewed',value:'2',icon:CheckCircle2},{label:'Awaiting review',value:'1',icon:Clock}].map(stat => <Card key={stat.label}><CardHeader className="flex flex-row items-center justify-between"><CardDescription>{stat.label}</CardDescription><stat.icon className="size-4 text-muted-foreground"/></CardHeader><CardContent className="text-3xl font-semibold">{stat.value}</CardContent></Card>)}</div>
    <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>Demo library</CardTitle><CardDescription className="mt-2">Sample journeys for the workspace. Open a screen to explore it.</CardDescription></div><Button variant={reviewedOnly ? 'default' : 'outline'} onClick={() => setReviewedOnly(!reviewedOnly)} aria-pressed={reviewedOnly} data-testid="filter-reviewed">{reviewedOnly ? 'Show all' : 'Reviewed only'}</Button></CardHeader><CardContent data-testid="recordings-list" className="divide-y">
      {visible.map(item => <div key={item.name} className="flex items-center gap-4 py-5"><div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted"><Film className="size-5"/></div><div className="min-w-0 flex-1"><p className="font-medium">{item.name}</p><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p></div><span className="text-sm tabular-nums text-muted-foreground">{item.duration}</span><Badge variant={item.reviewed ? 'secondary' : 'outline'}>{item.reviewed ? 'Reviewed' : 'Pending'}</Badge><Button variant="ghost" size="icon" asChild><a href={`#${item.route}`} aria-label={`Open ${item.name}`}><ArrowUpRight/></a></Button></div>)}
    </CardContent></Card>
    <p className="text-sm text-muted-foreground" data-testid="recordings-count" data-count={visible.length}>Showing {visible.length} of 3 demo journeys</p>
  </div>
}
