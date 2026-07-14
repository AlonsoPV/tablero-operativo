import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TeamFilters, TeamState } from './types'

export function TeamKanbanFilters({value,states,onChange,onClear}:{value:TeamFilters;states:TeamState[];onChange:(v:TeamFilters)=>void;onClear:()=>void}){
  const count=[value.search,value.dateFrom,value.dateTo,value.priority!=='all'?'x':'',value.stateId!=='all'?'x':''].filter(Boolean).length
  const field='h-9 min-w-0 rounded-md border-border/60 bg-background text-sm transition-[box-shadow,border-color,background-color]'
  const active='border-primary/55 bg-primary/[0.06] ring-2 ring-primary/15'
  return <div className={`kanban-toolbar flex min-w-0 flex-col gap-2 rounded-xl border bg-gradient-to-b from-card via-card to-muted/20 p-2.5 shadow-sm sm:p-3 ${count?'border-primary/25':'border-border/60'}`}>
    <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_7.25rem_7.25rem_auto] lg:items-center">
      <div className="relative col-span-2 min-w-0 lg:col-span-1"><Search className={`pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${value.search?'text-primary':'text-muted-foreground'}`}/><Input type="search" value={value.search} onChange={e=>onChange({...value,search:e.target.value})} placeholder="Buscar acciones…" aria-label="Buscar acciones" className={`${field} w-full pl-8 ${value.search?active:''}`}/></div>
      <Input type="date" value={value.dateFrom} onChange={e=>onChange({...value,dateFrom:e.target.value})} aria-label="Fecha limite desde" title="Desde" className={`${field} ${value.dateFrom?active:''}`}/>
      <Input type="date" value={value.dateTo} onChange={e=>onChange({...value,dateTo:e.target.value})} aria-label="Fecha limite hasta" title="Hasta" className={`${field} ${value.dateTo?active:''}`}/>
      <div className="hidden items-center justify-end gap-1.5 lg:flex">{count?<span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 text-[11px] font-semibold text-primary"><SlidersHorizontal className="h-3.5 w-3.5"/>{count} activo{count===1?'':'s'}</span>:<span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 text-[11px] text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5"/>Filtros</span>}{count?<Button variant="outline" size="sm" className="h-9 gap-1 border-primary/25 bg-primary/5 text-primary" onClick={onClear}><X className="h-3.5 w-3.5"/>Limpiar</Button>:null}</div>
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-2 border-t border-border/40 pt-2">
      <Select value={value.stateId} onValueChange={stateId=>onChange({...value,stateId})}><SelectTrigger aria-label="Estado" className={`${field} w-full ${value.stateId!=='all'?active:''}`}><SelectValue placeholder="Estado"/></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem>{states.map(s=><SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
      <Select value={value.priority} onValueChange={priority=>onChange({...value,priority})}><SelectTrigger aria-label="Prioridad" className={`${field} w-full ${value.priority!=='all'?active:''}`}><SelectValue placeholder="Prioridad"/></SelectTrigger><SelectContent><SelectItem value="all">Todas las prioridades</SelectItem>{['Baja','Media','Alta','Critica'].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
    </div>
    {count?<Button variant="outline" size="sm" className="h-9 gap-1 border-primary/25 bg-primary/5 text-primary lg:hidden" onClick={onClear}><X className="h-3.5 w-3.5"/>Limpiar filtros</Button>:null}
  </div>
}
