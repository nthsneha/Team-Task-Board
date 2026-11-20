import { useEffect, useMemo, useState, type FormEvent, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetBoardSummaryQueryKey,
  getListTasksQueryKey,
  getListTeamMembersQueryKey,
  useCreateTask,
  useDeleteTask,
  useGetBoardSummary,
  useListTasks,
  useListTeamMembers,
  useUpdateTask,
} from '@workspace/api-client-react';
import type { Task, TaskStatus, TeamMember, TaskInput } from '@workspace/api-client-react';
import { AlertCircle, CalendarDays, Check, ChevronDown, CirclePlus, Clock3, GripVertical, ListTodo, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';

type Props = {
  member: TeamMember;
  onMemberUpdated?: (member: TeamMember) => void;
};
const columns: { id: TaskStatus; label: string; intro: string; accent: string }[] = [
  { id: 'todo', label: 'To do', intro: 'On the horizon', accent: '#d96b47' },
  { id: 'in_progress', label: 'In progress', intro: 'In the works', accent: '#668f83' },
  { id: 'done', label: 'Done', intro: 'Across the line', accent: '#83909c' },
];

function dateLabel(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
function isOverdue(task: Task) {
  return !!task.dueDate && task.status !== 'done' && new Date(`${task.dueDate.slice(0, 10)}T23:59:59`) < new Date();
}

export default function BoardPage({ member, onMemberUpdated }: Props) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [dialogTask, setDialogTask] = useState<Task | null | 'new'>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const params = useMemo(() => filter ? { assigneeId: filter } : undefined, [filter]);
  const taskQuery = useListTasks(params, { query: { queryKey: getListTasksQueryKey(params) } });
  const summaryQuery = useGetBoardSummary({ query: { queryKey: getGetBoardSummaryQueryKey() } });
  const teamQuery = useListTeamMembers({ query: { queryKey: getListTeamMembersQueryKey() } });
  const tasks = taskQuery.data ?? [];
  const summary = summaryQuery.data;

  useEffect(() => {
    const stream = new EventSource('/api/events');
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
    };
    stream.addEventListener('board-change', refresh);
    return () => stream.close();
  }, [queryClient]);

  useEffect(() => {
    const currentMember = teamQuery.data?.find(person => person.id === member.id);
    if (currentMember && currentMember.role !== member.role) {
      onMemberUpdated?.(currentMember);
    }
  }, [teamQuery.data, member.id, member.role, onMemberUpdated]);

  const createTask = useCreateTask({ mutation: { onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() }),
    ]);
  } } });
  const updateTask = useUpdateTask({ mutation: { onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() }),
    ]);
  } } });
  const deleteTask = useDeleteTask({ mutation: { onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetBoardSummaryQueryKey() }),
    ]);
  } } });

  function moveTask(task: Task, status: TaskStatus) {
    if (task.status === status) return;
    updateTask.mutate({ taskId: task.id, data: { status } });
    setDragging(null);
  }
  function handleDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    const task = tasks.find(item => item.id === id);
    if (task) moveTask(task, status);
    setDragging(null);
  }
  async function saveTask(payload: TaskInput, existing?: Task) {
    if (existing) {
      updateTask.mutate({ taskId: existing.id, data: payload }, { onSuccess: () => setDialogTask(null) });
    } else {
      createTask.mutate({ data: payload }, { onSuccess: () => setDialogTask(null) });
    }
  }
  function removeTask(task: Task) {
    if (member.role !== 'admin') return;
    if (window.confirm(`Delete “${task.title}”? This cannot be undone.`)) deleteTask.mutate({ taskId: task.id });
  }

  return <div className="mx-auto max-w-[1440px]">
    <header className="flex flex-col gap-6 border-b border-[#ded7c9] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8e86]"><span className="size-1.5 rounded-full bg-[#6b998b]" /> Agency workspace <span className="text-[#b1b0a7]">/</span> Board</div>
        <h1 className="font-display text-4xl font-extrabold tracking-[-.06em] text-[#2d3541] md:text-[3.25rem]">The work, in motion.</h1>
        <p className="mt-2 text-sm text-[#747a7e]">A shared view of what’s next, what’s happening, and what’s done.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative">
          <span className="sr-only">Filter tasks by assignee</span><select value={filter} onChange={event => setFilter(event.target.value)} className="h-11 min-w-[172px] appearance-none rounded-xl border border-[#ddd6ca] bg-[#fbf8f1] pl-4 pr-10 text-xs font-bold text-[#4f5862] outline-none" data-testid="select-assignee-filter">
            <option value="">Everyone</option>
            {(teamQuery.data ?? []).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-[#7b817e]" size={15} />
        </label>
        <button onClick={() => { taskQuery.refetch(); summaryQuery.refetch(); }} disabled={taskQuery.isFetching} className="grid size-11 place-items-center rounded-xl border border-[#ddd6ca] bg-[#fbf8f1] text-[#69727a] transition hover:bg-white disabled:opacity-50" aria-label="Refresh board" data-testid="button-refresh-board"><RefreshCw size={16} className={taskQuery.isFetching ? 'animate-spin' : ''} /></button>
        <button onClick={() => setDialogTask('new')} className="flex h-11 items-center gap-2 rounded-xl bg-[#d96b47] px-4 text-xs font-bold text-white shadow-[0_6px_16px_rgba(183,87,57,.16)] transition hover:-translate-y-0.5 hover:bg-[#c9603f]" data-testid="button-create-task"><Plus size={16} /> New task</button>
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 py-5 sm:grid-cols-4">
      <SummaryTile label="All tasks" value={summary?.total} symbol="Total" loading={summaryQuery.isLoading} />
      <SummaryTile label="To do" value={summary?.byStatus.todo} symbol="01 / Queue" tint="orange" loading={summaryQuery.isLoading} />
      <SummaryTile label="In progress" value={summary?.byStatus.in_progress} symbol="02 / Focus" tint="green" loading={summaryQuery.isLoading} />
      <SummaryTile label="Overdue" value={summary?.overdue} symbol="Needs a look" tint="red" loading={summaryQuery.isLoading} />
    </section>

    {(taskQuery.isError || summaryQuery.isError || updateTask.isError || deleteTask.isError) && <div role="alert" className="mb-5 flex items-center justify-between rounded-xl border border-[#ebc6bc] bg-[#fae9e4] px-4 py-3 text-sm text-[#9d493e]"><span className="flex items-center gap-2"><AlertCircle size={16} /> {taskQuery.isError || summaryQuery.isError ? 'Some board data could not be loaded.' : 'That change could not be saved. Please try again.'}</span><button onClick={() => { taskQuery.refetch(); summaryQuery.refetch(); updateTask.reset(); deleteTask.reset(); }} className="font-bold underline" data-testid="button-retry-board">Try again</button></div>}

    {taskQuery.isLoading ? <div className="grid gap-5 md:grid-cols-3">{[1, 2, 3].map(n => <div key={n} className="min-h-[420px] animate-pulse rounded-[20px] border border-[#e1dbcf] bg-[#efebe2] p-4"><div className="h-5 w-24 rounded bg-[#e3ddd1]" /><div className="mt-6 h-28 rounded-xl bg-[#e5dfd4]" /><div className="mt-3 h-28 rounded-xl bg-[#e5dfd4]" /></div>)}</div> :
      <section className="grid items-start gap-4 md:grid-cols-3 md:gap-5" aria-label="Task board">
        {columns.map((column, index) => {
          const items = tasks.filter(task => task.status === column.id);
          return <div key={column.id} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, column.id)} className={`min-h-[300px] rounded-[19px] border p-3.5 transition-colors md:min-h-[440px] md:p-4 ${dragging !== null ? 'border-dashed border-[#aeb9b0] bg-[#eee9df]' : 'border-[#e2dccf] bg-[#efebe2]'}`} data-testid={`column-${column.id}`}>
            <div className="mb-4 flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5"><span className="size-2 rounded-full" style={{ background: column.accent }} /><div><h2 className="text-sm font-bold text-[#3e4752]">{column.label}</h2><p className="mt-0.5 text-[10px] text-[#888d87]">{column.intro}</p></div></div>
              <span className="grid size-7 place-items-center rounded-lg bg-[#e6e1d7] font-mono text-[10px] text-[#687078]" data-testid={`count-${column.id}`}>{String(items.length).padStart(2, '0')}</span>
            </div>
            <div className="space-y-3">
              {items.map((task, idx) => <TaskCard key={task.id} task={task} admin={member.role === 'admin'} onEdit={() => setDialogTask(task)} onDelete={() => removeTask(task)} onDragStart={event => { setDragging(task.id); event.dataTransfer.setData('text/plain', String(task.id)); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragging(null)} onMove={status => moveTask(task, status)} index={idx} />)}
              {items.length === 0 && <div className="flex min-h-[124px] flex-col items-center justify-center rounded-xl border border-dashed border-[#d8d1c5] px-4 text-center"><span className="mb-2 grid size-8 place-items-center rounded-full bg-[#e8e3d9] text-[#8a908d]"><ListTodo size={15} /></span><p className="text-xs font-semibold text-[#69727a]">Nothing here yet</p><p className="mt-1 text-[10px] text-[#979a92]">Drop a task or add one.</p></div>}
              {column.id === 'todo' && <button onClick={() => setDialogTask('new')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d7c9b8] py-3 text-xs font-bold text-[#a05b42] transition hover:border-[#c98b70] hover:bg-[#f2e6dc]" data-testid="button-add-task-column"><CirclePlus size={15} /> Add a task</button>}
            </div>
          </div>;
        })}
      </section>}
    <div className="mt-5 flex items-center justify-between text-[10px] text-[#8b8f87]"><span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-[#70a08f]" /> Changes sync across your team</span><span className="font-mono uppercase tracking-[.1em]">Board / 3 stages</span></div>
    {dialogTask !== null && <TaskDialog task={dialogTask === 'new' ? null : dialogTask} people={teamQuery.data ?? []} pending={createTask.isPending || updateTask.isPending} saveFailed={createTask.isError || updateTask.isError} onClose={() => setDialogTask(null)} onSave={payload => saveTask(payload, dialogTask === 'new' ? undefined : dialogTask)} />}
  </div>;
}

function SummaryTile({ label, value, symbol, tint, loading }: { label: string; value?: number; symbol: string; tint?: string; loading: boolean }) {
  const styles: Record<string, string> = { orange: 'text-[#bf6143]', green: 'text-[#4c8275]', red: 'text-[#b84e43]' };
  return <div className="rounded-2xl border border-[#e2dccf] bg-[#fbf8f1] px-4 py-3.5 md:px-5">
    <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.11em] text-[#858982]">{label}</span><span className={`font-mono text-[8px] uppercase tracking-[.07em] text-[#a0a096] ${tint ? styles[tint] : ''}`}>{symbol}</span></div>
    <div className={`mt-2 font-display text-3xl font-extrabold tracking-[-.06em] text-[#38424d] ${tint ? styles[tint] : ''}`} data-testid={`summary-${label.toLowerCase().replace(' ', '-')}`}>{loading ? <span className="inline-block h-8 w-10 animate-pulse rounded bg-[#e9e2d6]" /> : value ?? '—'}</div>
  </div>;
}

function TaskCard({ task, admin, onEdit, onDelete, onDragStart, onDragEnd, onMove, index }: { task: Task; admin: boolean; onEdit: () => void; onDelete: () => void; onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: () => void; onMove: (status: TaskStatus) => void; index: number }) {
  const overdue = isOverdue(task);
  const initials = task.assigneeName?.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  return <article draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className={`group relative cursor-grab rounded-xl border bg-[#fbf8f1] p-4 shadow-[0_2px_5px_rgba(49,53,57,.025)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(49,53,57,.08)] active:cursor-grabbing ${overdue ? 'border-[#e7b4a7]' : 'border-[#e1dbd0]'}`} style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }} data-testid={`card-task-${task.id}`}>
    <div className="absolute right-3 top-3 flex items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
      <button onClick={onEdit} aria-label={`Edit ${task.title}`} className="grid size-7 place-items-center rounded-lg text-[#808781] hover:bg-[#f0ece3] hover:text-[#39444e]" data-testid={`button-edit-task-${task.id}`}><Pencil size={13} /></button>
      {admin && <button onClick={onDelete} aria-label={`Delete ${task.title}`} className="grid size-7 place-items-center rounded-lg text-[#a07a70] hover:bg-[#fae9e4] hover:text-[#a44339]" data-testid={`button-delete-task-${task.id}`}><Trash2 size={14} /></button>}
      <span className="grid size-7 place-items-center text-[#bab9af]" aria-hidden="true"><GripVertical size={15} /></span>
    </div>
    <div className={`mb-3 h-[3px] w-8 rounded-full ${task.status === 'todo' ? 'bg-[#d96b47]' : task.status === 'in_progress' ? 'bg-[#6c9c8e]' : 'bg-[#909ba3]'}`} />
    <button onClick={onEdit} className="block w-full pr-14 text-left" data-testid={`button-open-task-${task.id}`}><h3 className="font-display text-[15px] font-bold leading-5 tracking-[-.025em] text-[#38414c]">{task.title}</h3>
      {task.description && <p className="mt-2 line-clamp-3 text-xs leading-[1.55] text-[#7b8080]">{task.description}</p>}
    </button>
    <div className="mt-4 flex items-center justify-between border-t border-[#eee8de] pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d8e5dc] text-[8px] font-bold text-[#406458]">{initials || '—'}</span>
        <span className="truncate text-[10px] font-semibold text-[#70777a]">{task.assigneeName || 'Unassigned'}</span>
      </div>
      <span className={`ml-2 flex shrink-0 items-center gap-1 text-[10px] font-semibold ${overdue ? 'text-[#b34d42]' : 'text-[#888c85]'}`}><CalendarDays size={11} />{overdue && <AlertCircle size={11} />}{dateLabel(task.dueDate)}</span>
    </div>
    <div className="mt-3 flex items-center justify-between">
      <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.08em] ${overdue ? 'text-[#b34d42]' : 'text-[#9a9b91]'}`}>{overdue ? <><Clock3 size={11} /> Overdue</> : task.status === 'done' ? <><Check size={11} /> Completed</> : 'Task'}</span>
      <label className="relative">
        <span className="sr-only">Move {task.title} to a status</span><select value={task.status} onChange={event => onMove(event.target.value as TaskStatus)} className="max-w-[100px] appearance-none bg-transparent pr-4 text-right text-[9px] font-bold text-[#848981] outline-none" data-testid={`select-task-status-${task.id}`}>{columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select><ChevronDown size={10} className="pointer-events-none absolute right-0 top-0.5 text-[#92968d]" />
      </label>
    </div>
  </article>;
}

function TaskDialog({ task, people, pending, saveFailed, onClose, onSave }: { task: Task | null; people: TeamMember[]; pending: boolean; saveFailed: boolean; onClose: () => void; onSave: (payload: TaskInput) => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError('Give this task a name first.'); return; }
    onSave({ title: title.trim(), description: description.trim(), status, assigneeId: assigneeId || null, dueDate: dueDate || null });
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#202a35]/40 p-0 backdrop-blur-[2px] md:items-center md:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" className="w-full max-w-[520px] overflow-hidden rounded-t-[24px] border border-[#e1dbd0] bg-[#fbf8f1] shadow-[0_24px_80px_rgba(24,32,39,.25)] md:rounded-[24px]">
      <header className="flex items-start justify-between border-b border-[#e8e1d6] px-6 py-5">
        <div><p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#d06b49]">{task ? 'Edit the details' : 'Add to the board'}</p><h2 id="task-dialog-title" className="mt-1 font-display text-2xl font-extrabold tracking-[-.05em]">{task ? 'Update task' : 'New task'}</h2></div>
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-[#7a807f] hover:bg-[#eee9df]" aria-label="Close dialog" data-testid="button-close-task-dialog"><X size={18} /></button>
      </header>
      <form onSubmit={submit} className="space-y-4 px-6 py-5">
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#48515a]">Task name</span><input autoFocus value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="What needs to happen?" className="h-11 w-full rounded-xl border border-[#ded8cc] bg-[#fffdf8] px-3.5 text-sm text-[#303a45] outline-none placeholder:text-[#aaa99f] focus:border-[#cb8064]" data-testid="input-task-title" /></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#48515a]">A few details <span className="font-normal text-[#999b93]">/ optional</span></span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={2000} placeholder="Add context for the team..." className="w-full resize-y rounded-xl border border-[#ded8cc] bg-[#fffdf8] px-3.5 py-3 text-sm leading-6 text-[#303a45] outline-none placeholder:text-[#aaa99f] focus:border-[#cb8064]" data-testid="input-task-description" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#48515a]">Status</span><select value={status} onChange={event => setStatus(event.target.value as TaskStatus)} className="h-11 w-full rounded-xl border border-[#ded8cc] bg-[#fffdf8] px-3 text-sm text-[#303a45] outline-none focus:border-[#cb8064]" data-testid="select-task-status">{columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#48515a]">Due date</span><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="h-11 w-full rounded-xl border border-[#ded8cc] bg-[#fffdf8] px-3 text-sm text-[#303a45] outline-none focus:border-[#cb8064]" data-testid="input-task-due-date" /></label>
        </div>
        <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#48515a]">Assignee</span><select value={assigneeId} onChange={event => setAssigneeId(event.target.value)} className="h-11 w-full rounded-xl border border-[#ded8cc] bg-[#fffdf8] px-3 text-sm text-[#303a45] outline-none focus:border-[#cb8064]" data-testid="select-task-assignee"><option value="">Unassigned</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        {(error || saveFailed) && <p role="alert" className="text-xs font-semibold text-[#ad4c42]">{error || 'This task could not be saved. Please try again.'}</p>}
        <footer className="flex items-center justify-end gap-2 border-t border-[#e8e1d6] pt-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-3 text-xs font-bold text-[#6d7476] hover:bg-[#f0ece3]" data-testid="button-cancel-task">Cancel</button>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[#d96b47] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#c9603f] disabled:opacity-60" data-testid="button-save-task">{pending && <LoaderCircle size={14} className="animate-spin" />}{task ? 'Save changes' : 'Create task'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
