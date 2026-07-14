import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, Ban, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Layers3, Plus, SlidersHorizontal, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { teamKanbanService } from './service'
import { EMPTY_TEAM_FILTERS, type TeamAction, type TeamBoard, type TeamFilters } from './types'
import { TeamActionFormDialog } from './TeamActionFormDialog'
import { TeamKanbanFilters } from './TeamKanbanFilters'

const qk = { areas: ['team-kanban','areas'] as const, board: (id: string) => ['team-kanban','board',id] as const }
const priorityTone: Record<string,string> = { Baja:'bg-slate-100 text-slate-700', Media:'bg-blue-100 text-blue-700', Alta:'bg-orange-100 text-orange-700', Critica:'bg-red-100 text-red-700' }

export function TeamKanbanPage() {
  const qc = useQueryClient()
  const [areaId,setAreaId] = useState<string | null>(null)
  const [createOpen,setCreateOpen] = useState(false)
  const [escalating,setEscalating] = useState<TeamAction | null>(null)
  const [filtersExpanded,setFiltersExpanded] = useState(false)
  const [filters,setFilters] = useState<TeamFilters>(EMPTY_TEAM_FILTERS)
  const boardScrollRef = useRef<HTMLDivElement>(null)
  const areas = useQuery({ queryKey:qk.areas, queryFn:teamKanbanService.areas })
  const board = useQuery({ queryKey:qk.board(areaId ?? ''), queryFn:()=>teamKanbanService.board(areaId!), enabled:Boolean(areaId) })
  const selectedArea = areas.data?.find((a)=>a.id===areaId)
  const refresh = async () => { if(areaId) await qc.invalidateQueries({queryKey:qk.board(areaId)}); await qc.invalidateQueries({queryKey:qk.areas}) }
  const update = useMutation({ mutationFn:({id,...p}:{id:string;stateId?:string;blocked?:boolean;assignee?:string;priority?:string})=>teamKanbanService.update(id,p), onSuccess:refresh, onError:(e)=>toast.error(e.message) })
  const scrollBoard = (direction: -1 | 1) => boardScrollRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' })
  const filteredActions=useMemo(()=>(board.data?.actions??[]).filter(action=>{const term=filters.search.trim().toLowerCase();if(term&&![action.titulo,action.descripcion,action.asignado_nombre].some(v=>v?.toLowerCase().includes(term)))return false;if(filters.priority!=='all'&&action.prioridad!==filters.priority)return false;if(filters.stateId!=='all'&&action.estado_id!==filters.stateId)return false;const due=action.fecha_limite?.slice(0,10)??'';if(filters.dateFrom&&(!due||due<filters.dateFrom))return false;if(filters.dateTo&&(!due||due>filters.dateTo))return false;return true}),[board.data?.actions,filters])
  const activeFilterCount=[filters.search,filters.dateFrom,filters.dateTo,filters.priority!=='all'?'x':'',filters.stateId!=='all'?'x':''].filter(Boolean).length

  if (!areaId) return <AreasHome loading={areas.isLoading} error={areas.error} areas={areas.data ?? []} onOpen={setAreaId}/>
  return (
    <div className="kanban-page mx-auto flex w-full max-w-7xl flex-col space-y-6 overflow-x-hidden px-3 py-5 sm:space-y-8 sm:px-6 sm:py-6">
      <header className="kanban-header flex min-w-0 flex-col gap-2.5">
        <div className="min-w-0 space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kanban por Equipos</p>
          <div className="grid min-w-0 gap-2.5 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)] md:items-start md:gap-x-4">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:pt-0.5 md:text-2xl">{selectedArea?.nombre}</h1>
            <div className="min-w-0 md:max-w-md"><Button variant="outline" size="sm" onClick={()=>setAreaId(null)}><ArrowLeft className="mr-2 h-4 w-4"/>Mis Areas</Button></div>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">Gestiona acciones privadas del equipo por estado con la misma experiencia del Kanban Corporativo.</p>
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 rounded-xl border border-border/70 bg-muted/25 p-2 shadow-sm ring-1 ring-border/30 sm:flex sm:items-center sm:justify-between sm:p-3">
            <Button className="h-11 min-h-11 w-full justify-center gap-2 px-4 text-sm font-semibold shadow-md ring-2 ring-primary/25 sm:h-10 sm:min-h-10 sm:w-auto" onClick={()=>setCreateOpen(true)}><Plus className="h-4 w-4 stroke-[2.5]"/>Nueva accion</Button>
            <Button variant="outline" className={`relative h-11 min-h-11 w-full justify-center gap-2 border-2 font-semibold shadow-sm sm:h-10 sm:min-h-10 sm:w-auto ${filtersExpanded||activeFilterCount?'border-primary/50 bg-primary/5 text-primary':''}`} onClick={()=>setFiltersExpanded(v=>!v)} aria-expanded={filtersExpanded}><SlidersHorizontal className="h-4 w-4"/>Filtros{activeFilterCount?<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"/>:null}</Button>
          </div>
        </div>
      </header>
      {board.isLoading ? <p className="py-16 text-center text-muted-foreground">Cargando tablero...</p> : board.error ? <p className="rounded-lg border border-destructive/30 p-4 text-destructive">{board.error.message}</p> : board.data ? (
        <div className="space-y-4">
          {filtersExpanded?<TeamKanbanFilters value={filters} states={board.data.states} onChange={setFilters} onClear={()=>setFilters(EMPTY_TEAM_FILTERS)}/>:null}
          <nav className="flex min-w-0 gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-card p-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Estados del Kanban">
            {board.data.states.map((state)=>{const count=filteredActions.filter(a=>a.estado_id===state.id).length;return <button key={state.id} type="button" onClick={()=>document.getElementById(`team-column-${state.id}`)?.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})} className="flex shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground focus:border-primary focus:bg-primary/10 focus:text-primary"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60"><i className="h-2.5 w-2.5 rounded-full" style={{background:state.color}}/></span><span>{state.nombre}</span><span className="min-w-5 rounded-full bg-muted px-1.5 py-0.5 text-center text-xs tabular-nums">{count}</span></button>})}
          </nav>
        <div className="relative -mx-3 min-w-0 sm:mx-0">
          <Button type="button" variant="outline" size="icon" onClick={()=>scrollBoard(-1)} className="absolute left-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border-primary/25 bg-background/95 text-primary shadow-md hover:bg-primary hover:text-primary-foreground sm:flex" aria-label="Estado anterior"><ChevronLeft className="h-5 w-5"/></Button>
          <Button type="button" variant="outline" size="icon" onClick={()=>scrollBoard(1)} className="absolute right-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border-primary/25 bg-background/95 text-primary shadow-md hover:bg-primary hover:text-primary-foreground sm:flex" aria-label="Estado siguiente"><ChevronRight className="h-5 w-5"/></Button>
          <div ref={boardScrollRef} className="kanban-board flex min-w-0 snap-x snap-proximity gap-4 overflow-x-auto overscroll-x-contain px-3 pb-4 pt-1 sm:gap-5 sm:px-12 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary">
          {board.data.states.map((state)=>{const stateActions=filteredActions.filter(a=>a.estado_id===state.id);return <section id={`team-column-${state.id}`} key={state.id} className="kanban-column relative flex min-h-[420px] w-[min(300px,calc(100vw-1.25rem))] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/50 bg-muted/10 sm:w-[300px] sm:min-w-[280px] sm:max-w-[300px]">
            <div className="h-1 w-full shrink-0" style={{background:state.color}} />
            <header className="flex items-center justify-between px-4 pb-3 pt-3.5"><span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:state.color}}/><span className="truncate">{state.nombre}</span></span><span className="min-w-[24px] rounded-full bg-background/80 px-2.5 py-0.5 text-center text-xs font-medium tabular-nums text-muted-foreground">{stateActions.length}</span></header>
            <div className="kanban-column-cards flex min-h-[200px] flex-1 flex-col gap-3 overflow-y-auto px-3 pb-4 pt-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-border">{stateActions.map(action=><ActionCard key={action.id} action={action} board={board.data!} onMove={(stateId)=>update.mutate({id:action.id,stateId})} onAssign={(assignee)=>update.mutate({id:action.id,assignee})} onPriority={(priority)=>update.mutate({id:action.id,priority})} onBlock={()=>update.mutate({id:action.id,blocked:!action.bloqueada})} onEscalate={()=>setEscalating(action)}/>)}{stateActions.length===0?<div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/30 px-4 text-center"><p className="text-sm font-medium text-muted-foreground">Sin acciones</p><p className="mt-1 text-xs text-muted-foreground/75">Las acciones apareceran aqui.</p></div>:null}</div>
          </section>})}
        </div></div></div>
      ):null}
      {board.data ? <TeamActionFormDialog open={createOpen} onOpenChange={setCreateOpen} areaId={areaId} areaName={selectedArea?.nombre ?? 'Equipo'} board={board.data} onDone={refresh}/> : null}
      <EscalateDialog action={escalating} onClose={()=>setEscalating(null)} onDone={refresh}/>
    </div>
  )
}

function AreasHome({areas,onOpen,loading,error}:{areas:Array<{id:string;nombre:string;is_leader:boolean;member_count:number;open_count:number}>;onOpen:(id:string)=>void;loading:boolean;error:Error|null}) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Kanban por Equipos</p><h1 className="mt-1 text-3xl font-bold">Mis Areas</h1><p className="mt-2 text-muted-foreground">Selecciona un equipo para administrar su operacion.</p>
    {loading?<p className="py-16 text-center text-muted-foreground">Cargando areas...</p>:error?<p className="mt-8 rounded-lg border border-destructive/30 p-4 text-destructive">{error.message}</p>:areas.length===0?<p className="mt-8 rounded-xl border border-dashed p-10 text-center text-muted-foreground">No tienes areas asignadas.</p>:<div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{areas.map(a=><button key={a.id} onClick={()=>onOpen(a.id)} className="group rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><div className="flex items-start justify-between"><span className="rounded-xl bg-primary/10 p-3 text-primary"><Layers3 className="h-6 w-6"/></span>{a.is_leader?<Badge>Lider</Badge>:<Badge variant="secondary">Integrante</Badge>}</div><h2 className="mt-5 text-xl font-bold group-hover:text-primary">{a.nombre}</h2><div className="mt-4 flex gap-4 text-sm text-muted-foreground"><span className="flex items-center gap-1"><Users className="h-4 w-4"/>{a.member_count} integrantes</span><span>{a.open_count} abiertas</span></div></button>)}</div>}
  </div>
}

function ActionCard({action,board,onMove,onAssign,onPriority,onBlock,onEscalate}:{action:TeamAction;board:TeamBoard;onMove:(s:string)=>void;onAssign:(s:string)=>void;onPriority:(s:string)=>void;onBlock:()=>void;onEscalate:()=>void}) { return <Card className={`group rounded-xl border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md ${action.bloqueada?'border-red-300 ring-1 ring-red-200':''}`}><CardHeader className="p-4 pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-sm font-semibold leading-snug tracking-tight">{action.titulo}</CardTitle><Badge className={`${priorityTone[action.prioridad]} shrink-0 border-0 text-[10px]`}>{action.prioridad}</Badge></div></CardHeader><CardContent className="space-y-3 p-4 pt-1">{action.descripcion?<p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{action.descripcion}</p>:null}{action.fecha_limite?<p className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5"/>{new Date(action.fecha_limite).toLocaleDateString('es-MX')}</p>:null}<Select value={action.estado_id} onValueChange={onMove}><SelectTrigger className="h-8 border-border/70 bg-background text-xs"><SelectValue/></SelectTrigger><SelectContent>{board.states.map(s=><SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>{board.isLeader?<div className="grid grid-cols-2 gap-2"><Select value={action.asignado_a} onValueChange={onAssign}><SelectTrigger className="h-8 border-border/70 text-xs"><SelectValue/></SelectTrigger><SelectContent>{board.members.map(m=><SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}</SelectContent></Select><Select value={action.prioridad} onValueChange={onPriority}><SelectTrigger className="h-8 border-border/70 text-xs"><SelectValue/></SelectTrigger><SelectContent>{['Baja','Media','Alta','Critica'].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>:<p className="text-xs font-medium text-muted-foreground">{action.asignado_nombre}</p>}<div className="flex flex-wrap gap-1 border-t border-border/50 pt-2"><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onBlock}><Ban className="mr-1 h-3.5 w-3.5"/>{action.bloqueada?'Desbloquear':'Bloquear'}</Button>{board.isLeader&&!action.escalada?<Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEscalate}><ArrowUpRight className="mr-1 h-3.5 w-3.5"/>Escalar</Button>:null}{action.escalada?<Badge variant="outline" className="text-[10px]"><CheckCircle2 className="mr-1 h-3 w-3"/>Corporativo</Badge>:null}</div></CardContent></Card> }

function EscalateDialog({action,onClose,onDone}:{action:TeamAction|null;onClose:()=>void;onDone:()=>Promise<void>}) { const [reason,setReason]=useState('');const mutation=useMutation({mutationFn:()=>teamKanbanService.escalate(action!.id,reason),onSuccess:async()=>{toast.success('Accion enviada al Kanban Corporativo');setReason('');onClose();await onDone()},onError:(e)=>toast.error(e.message)});return <Dialog open={Boolean(action)} onOpenChange={v=>{if(!v)onClose()}}><DialogContent><DialogHeader><DialogTitle>Escalar al Kanban Corporativo</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Se conservaran area origen, lider, fecha, prioridad y motivo.</p><div><Label>Motivo del escalamiento</Label><textarea className="mt-1 min-h-28 w-full rounded-md border bg-background p-2 text-sm" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></div><Button disabled={reason.trim().length<5||mutation.isPending} onClick={()=>mutation.mutate()}>Confirmar escalamiento</Button></DialogContent></Dialog>}
