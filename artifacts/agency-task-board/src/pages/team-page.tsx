import { useQueryClient } from '@tanstack/react-query';
import { getListTeamMembersQueryKey, useListTeamMembers, useUpdateTeamMemberRole } from '@workspace/api-client-react';
import type { TeamMember } from '@workspace/api-client-react';
import { AlertCircle, ArrowUpRight, LoaderCircle, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function TeamPage({ member, onMemberUpdated }: { member: TeamMember; onMemberUpdated: (member: TeamMember) => void }) {
  const cache = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState(false);
  const query = useListTeamMembers({ query: { queryKey: getListTeamMembersQueryKey() } });
  const updateRole = useUpdateTeamMemberRole({ mutation: { onSuccess: async (updated) => {
    await cache.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
    if (updated.id === member.id) onMemberUpdated(updated);
    setBusyId(null);
    setRoleError(false);
  }, onError: () => { setBusyId(null); setRoleError(true); } } });
  const members = query.data ?? [];

  useEffect(() => {
    const stream = new EventSource('/api/events');
    const refresh = () => cache.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
    stream.addEventListener('board-change', refresh);
    return () => stream.close();
  }, [cache]);

  useEffect(() => {
    const updatedCurrent = members.find(person => person.id === member.id);
    if (updatedCurrent && updatedCurrent.role !== member.role) {
      onMemberUpdated(updatedCurrent);
    }
  }, [members, member.id, member.role, onMemberUpdated]);

  function changeRole(person: TeamMember, role: TeamMember['role']) {
    if (person.role === role || member.role !== 'admin') return;
    setBusyId(person.id);
    updateRole.mutate({ userId: person.id, data: { role } });
  }
  return <div className="mx-auto max-w-[1120px]">
    <header className="flex flex-col justify-between gap-5 border-b border-[#ded7c9] pb-7 md:flex-row md:items-end">
      <div><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#8b8e86]"><span className="size-1.5 rounded-full bg-[#6b998b]" /> Agency workspace <span className="text-[#b1b0a7]">/</span> People</div><h1 className="font-display text-4xl font-extrabold tracking-[-.06em] text-[#2d3541] md:text-[3.25rem]">Good work is shared.</h1><p className="mt-2 max-w-lg text-sm leading-6 text-[#747a7e]">The people bringing ideas to life. Everyone gets the same board; admins look after the team.</p></div>
      <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#dfd8cb] bg-[#fbf8f1] px-4 py-3 text-xs font-bold text-[#56616a]"><UsersRound size={16} className="text-[#d96b47]" /> {members.length} {members.length === 1 ? 'person' : 'people'} <span className="text-[#a5a69d]">/</span> 5 seats</div>
    </header>

    <section className="mt-7 grid gap-5 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-3 flex items-center justify-between px-1"><h2 className="text-xs font-bold uppercase tracking-[.12em] text-[#677078]">Team directory</h2><span className="font-mono text-[9px] text-[#9a9b92]">MEMBERS / {String(members.length).padStart(2, '0')}</span></div>
        {query.isLoading ? <div className="space-y-3">{[1, 2, 3].map(n => <div key={n} className="h-[86px] animate-pulse rounded-2xl border border-[#e2dccf] bg-[#efebe2]" />)}</div> :
          query.isError ? <div role="alert" className="rounded-2xl border border-[#ebc6bc] bg-[#fae9e4] p-6 text-sm text-[#9d493e]"><div className="flex items-center gap-2 font-bold"><AlertCircle size={16} /> The team list didn’t load.</div><button onClick={() => query.refetch()} className="mt-3 text-xs font-bold underline" data-testid="button-retry-team">Try again</button></div> :
          members.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d5cec2] bg-[#f0ece3] px-6 py-12 text-center"><UsersRound className="mx-auto text-[#92968d]" size={24} /><h3 className="mt-3 font-display text-lg font-bold">Your team starts here</h3><p className="mt-1 text-sm text-[#858a86]">When teammates sign up, they’ll appear here.</p></div> :
            <div className="overflow-hidden rounded-[18px] border border-[#e0d9cd] bg-[#fbf8f1]">
              {members.map((person, index) => <MemberRow key={person.id} person={person} current={person.id === member.id} admin={member.role === 'admin'} busy={busyId === person.id && updateRole.isPending} onChange={role => changeRole(person, role)} last={index === members.length - 1} />)}
            </div>}
        {roleError && <div role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-[#ebc6bc] bg-[#fae9e4] px-4 py-3 text-xs font-semibold text-[#9d493e]"><AlertCircle size={14} /> Role update failed. Your permissions may have changed; try again.</div>}
      </div>
      <aside className="h-fit rounded-[20px] bg-[#2c3946] p-5 text-[#f6f1e8]">
        <div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-[#43515c] text-[#f0a37d]"><ShieldCheck size={18} /></span><span className="font-mono text-[9px] uppercase tracking-[.13em] text-[#aab2b0]">Workspace access</span></div>
        <h2 className="mt-5 font-display text-xl font-extrabold tracking-[-.04em]">One team.<br />Shared momentum.</h2>
        <p className="mt-3 text-xs leading-5 text-[#bec5c2]">Members can create, edit, and move any task. Admins can also manage roles and remove tasks.</p>
        <div className="mt-5 space-y-3 border-t border-[#4b5861] pt-4">
          <div className="flex items-center gap-2 text-[11px] text-[#e1e3dc]"><span className="size-1.5 rounded-full bg-[#e6a17f]" /> Admin <span className="ml-auto text-[#abb4b1]">Full board control</span></div>
          <div className="flex items-center gap-2 text-[11px] text-[#e1e3dc]"><span className="size-1.5 rounded-full bg-[#8cb4a5]" /> Member <span className="ml-auto text-[#abb4b1]">Work on any task</span></div>
        </div>
        {member.role === 'admin' && <div className="mt-5 rounded-xl border border-[#53616a] bg-[#34424e] p-3.5"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#abb4b1]">Admin note</p><p className="mt-1.5 text-[11px] leading-5 text-[#d5dbd5]">Role changes take effect immediately across the workspace.</p></div>}
      </aside>
    </section>
  </div>;
}

function MemberRow({ person, current, admin, busy, onChange, last }: { person: TeamMember; current: boolean; admin: boolean; busy: boolean; onChange: (role: TeamMember['role']) => void; last: boolean }) {
  const joined = new Date(person.createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  const initials = person.name.trim().split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase() || person.email.slice(0, 1).toUpperCase();
  return <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 md:px-5 ${last ? '' : 'border-b border-[#eee8de]'}`} data-testid={`row-member-${person.id}`}>
    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#dce8df] font-display text-xs font-extrabold text-[#426556]">{initials}</div>
    <div className="min-w-[145px] flex-1"><div className="flex items-center gap-2"><p className="text-sm font-bold text-[#38414c]" data-testid={`text-member-name-${person.id}`}>{person.name}</p>{current && <span className="rounded-full bg-[#e7eee8] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[.08em] text-[#4c7d6f]">You</span>}</div><p className="mt-1 text-xs text-[#818682]">{person.email}</p></div>
    <div className="hidden min-w-[85px] text-right sm:block"><p className="text-[9px] font-bold uppercase tracking-[.1em] text-[#a0a197]">Joined</p><p className="mt-1 text-xs font-semibold text-[#686f73]">{joined}</p></div>
    {admin ? <label className="relative ml-auto">
      <span className="sr-only">Role for {person.name}</span><select value={person.role} disabled={busy} onChange={event => onChange(event.target.value as TeamMember['role'])} className="h-9 appearance-none rounded-lg border border-[#e0d9cd] bg-[#f5f1e8] pl-3 pr-8 text-[10px] font-bold uppercase tracking-[.07em] text-[#59636b] outline-none hover:border-[#c6b7a6] disabled:opacity-50" data-testid={`select-role-${person.id}`}><option value="member">Member</option><option value="admin">Admin</option></select>{busy ? <LoaderCircle size={12} className="absolute right-2.5 top-3 animate-spin text-[#d96b47]" /> : <ArrowUpRight size={12} className="pointer-events-none absolute right-2.5 top-3 text-[#91958d]" />}
    </label> : <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.08em] ${person.role === 'admin' ? 'bg-[#f6e4d9] text-[#a7563b]' : 'bg-[#e7eee8] text-[#4c7d6f]'}`}><UserRound size={11} />{person.role}</span>}
  </div>;
}
