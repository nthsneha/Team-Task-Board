import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Redirect, useLocation, Router as WouterRouter, Link } from 'wouter';
import { ArrowRight, ArrowUpRight, Layers3, LockKeyhole, Sparkles } from 'lucide-react';
import { useEnsureCurrentUser } from '@workspace/api-client-react';
import type { TeamMember } from '@workspace/api-client-react';
import BoardPage from '@/pages/board-page';
import TeamPage from '@/pages/team-page';
import NotFound from '@/pages/not-found';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#d96b47',
    colorForeground: '#2d3541',
    colorMutedForeground: '#72777d',
    colorDanger: '#b64038',
    colorBackground: '#fbf8f1',
    colorInput: '#fffdf8',
    colorInputForeground: '#2d3541',
    colorNeutral: '#2d3541',
    fontFamily: 'DM Sans',
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf8f1] rounded-[22px] w-[440px] max-w-full overflow-hidden border border-[#e3ddd2]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#2d3541] font-bold tracking-[-0.03em]',
    headerSubtitle: 'text-[#72777d]',
    socialButtonsBlockButtonText: 'text-[#2d3541] font-semibold',
    formFieldLabel: 'text-[#3f4650] font-semibold',
    footerActionLink: 'text-[#bd5635] font-semibold',
    footerActionText: 'text-[#72777d]',
    dividerText: 'text-[#72777d]',
    identityPreviewEditButton: 'text-[#bd5635]',
    formFieldSuccessText: 'text-[#287568]',
    alertText: 'text-[#a33d36]',
    logoBox: 'rounded-xl',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#ded8cd] bg-[#fffdf8] hover:bg-[#f5efe4]',
    socialButtonsRoot: 'hidden',
    socialButtons: 'hidden',
    dividerRow: 'hidden',
    formButtonPrimary: 'bg-[#d96b47] hover:bg-[#c65d3b] text-white font-bold',
    formFieldInput: 'bg-[#fffdf8] border-[#ded8cd] text-[#2d3541] shadow-none',
    footerAction: 'text-[#72777d]',
    dividerLine: 'bg-[#ded8cd]',
    alert: 'bg-[#fae9e5] border-[#edc5bd]',
    otpCodeFieldInput: 'bg-[#fffdf8] border-[#ded8cd] text-[#2d3541]',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function Home() {
  return (
    <div className="min-h-[100dvh] bg-[#f5f1e8] text-[#293441]">
      <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-6 md:px-12">
        <Link href="/" className="flex items-center gap-3" data-testid="link-home-brand">
          <span className="grid size-10 place-items-center rounded-xl bg-[#283442] text-[#f5b291]"><Layers3 size={19} /></span>
          <span className="font-display text-lg font-extrabold tracking-[-.05em]">goodwork<span className="text-[#d96b47]">.</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="rounded-full px-4 py-2 text-sm font-semibold text-[#58606a] transition hover:text-[#d96b47]" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="rounded-full bg-[#d96b47] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#c45e3e]" data-testid="link-sign-up">Create account <ArrowUpRight className="ml-1 inline" size={15} /></Link>
        </div>
      </nav>
      <main className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 pb-16 pt-8 md:min-h-[calc(100dvh-88px)] md:grid-cols-[1.06fr_.94fr] md:px-12 md:pb-24 md:pt-0">
        <section className="rise-in max-w-[660px]">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#ded7c9] bg-[#faf7f0] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[.13em] text-[#687068]">
            <span className="size-2 rounded-full bg-[#72a695]" /> A shared workspace for the good work
          </div>
          <h1 className="font-display text-[clamp(3.6rem,8vw,7.5rem)] font-extrabold leading-[.91] tracking-[-.075em]">
            Make room<br />for <span className="relative inline-block text-[#d96b47]">great work.<i className="absolute -bottom-2 left-1 h-[7px] w-[88%] -rotate-[2deg] rounded-full bg-[#e9b69d]" /></span>
          </h1>
          <p className="mt-8 max-w-[470px] text-lg leading-8 text-[#687078]">A clear, shared task board for the people behind the campaigns. Keep the moving parts moving — together.</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/sign-up" className="group inline-flex items-center gap-3 rounded-xl bg-[#283442] px-6 py-4 text-sm font-bold text-[#f8f4eb] shadow-[0_12px_28px_rgba(38,49,62,.14)] transition hover:-translate-y-1" data-testid="link-start-board">Start your workspace <ArrowRight className="transition group-hover:translate-x-1" size={17} /></Link>
            <span className="inline-flex items-center gap-2 px-2 text-xs font-medium text-[#80847f]"><LockKeyhole size={14} /> Private to your team</span>
          </div>
          <div className="mt-14 flex items-center gap-4 border-t border-[#ded7c9] pt-6">
            <div className="flex -space-x-2">
              {['ML', 'JR', 'AK', 'TS', 'DW'].map((i, n) => <span key={i} className={`grid size-9 place-items-center rounded-full border-2 border-[#f5f1e8] text-[10px] font-bold ${['bg-[#dca88e]', 'bg-[#91b7a6]', 'bg-[#d8c37f]', 'bg-[#a9b5ca]', 'bg-[#c7a9bc]'][n]}`}>{i}</span>)}
            </div>
            <p className="text-xs leading-5 text-[#737974]"><strong className="text-[#343c46]">One team, one view.</strong><br />Built for the five-person kind of close-knit.</p>
          </div>
        </section>
        <section className="rise-in delay-2 relative mx-auto w-full max-w-[590px]" aria-label="Task board preview">
          <div className="absolute -right-3 -top-5 z-10 flex items-center gap-2 rounded-xl border border-[#e2dbcf] bg-[#fbf8f1] px-4 py-3 shadow-[0_12px_34px_rgba(46,52,59,.10)] md:-right-7">
            <Sparkles size={16} className="text-[#d96b47]" /><span className="text-xs font-semibold text-[#4d555e]">A little more clarity, daily</span>
          </div>
          <div className="overflow-hidden rounded-[26px] border border-[#dcd5c8] bg-[#faf7f0] shadow-[0_30px_85px_rgba(44,51,60,.14)]">
            <div className="flex items-center justify-between border-b border-[#e6dfd2] px-5 py-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#8b8d85]">Studio / Overview</p><p className="mt-1 font-display text-lg font-bold tracking-[-.04em]">Campaigns in motion</p></div>
              <span className="rounded-lg bg-[#e7eee8] px-3 py-2 text-[10px] font-bold text-[#437464]">5 people</span>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4">
              {[
                { title: 'To do', count: '03', color: '#d96b47', cards: [['Autumn launch', 'Creative brief'], ['Studio newsletter', 'Content'], ['Partner toolkit', 'Design']] },
                { title: 'In progress', count: '02', color: '#658d83', cards: [['Field notes', 'Social'], ['Brand refresh', 'Strategy']] },
                { title: 'Done', count: '04', color: '#8793a0', cards: [['Q3 report', 'Research'], ['Paid audit', 'Media']] },
              ].map((col) => <div key={col.title} className="min-h-[248px] rounded-xl bg-[#f1ede4] p-2.5">
                <div className="mb-3 flex items-center justify-between px-1"><span className="text-[10px] font-bold text-[#515963]">{col.title}</span><span className="font-mono text-[9px] text-[#989890]">{col.count}</span></div>
                {col.cards.map((card, i) => <div key={card[0]} className="mb-2 rounded-lg border border-[#e6dfd4] bg-[#fffdf8] p-2.5 shadow-[0_2px_3px_rgba(42,46,51,.03)]">
                  <div className="mb-2 h-[3px] w-7 rounded-full" style={{ background: col.color }} />
                  <p className="text-[10px] font-bold leading-4 text-[#424a55]">{card[0]}</p><p className="mt-1 text-[8px] text-[#989890]">{card[1]}</p>
                  <div className="mt-3 flex items-center justify-between"><span className="size-4 rounded-full bg-[#e9c1a8]" /><span className={`text-[8px] ${i === 0 ? 'text-[#bc6549]' : 'text-[#8d918d]'}`}>{i === 0 ? 'Due today' : 'This week'}</span></div>
                </div>)}
              </div>)}
            </div>
            <div className="flex items-center justify-between border-t border-[#e6dfd2] px-5 py-3 text-[10px] text-[#8a8e88]"><span>One board, always up to date</span><span className="font-mono">LIVE / 01</span></div>
          </div>
          <div className="absolute -bottom-5 -left-4 h-14 w-14 -rotate-6 rounded-2xl border border-[#dfd7c9] bg-[#d7e6dc] md:-left-7" />
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1440px] items-center justify-between border-t border-[#ded7c9] px-6 py-5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#888b84] md:px-12"><span>goodwork studio / team space</span><span>Thoughtfully in sync</span></footer>
    </div>
  );
}

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/board" /></Show><Show when="signed-out"><Home /></Show></>;
}

function SignedInWorkspace() {
  const { isLoaded, isSignedIn, user } = useUser();
  const ensure = useEnsureCurrentUser();
  const queryClient = useQueryClient();
  const attemptedFor = useRef<string | null>(null);
  const [syncedMember, setSyncedMember] = useState<TeamMember | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (attemptedFor.current === user.id) return;
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    if (!email) return;
    attemptedFor.current = user.id;
    ensure.mutate({ data: { email, name: user.fullName?.trim() || user.username || email.split('@')[0] } }, {
      onSuccess: (member: TeamMember) => {
        setSyncedMember(member);
        queryClient.setQueryData(['current-member'], member);
        queryClient.invalidateQueries({ queryKey: ['/api/team'] });
      },
      onError: () => { attemptedFor.current = null; },
    });
  }, [isLoaded, isSignedIn, user, ensure.mutate, queryClient]);

  if (!isLoaded || (isSignedIn && ensure.isPending)) return <WorkspaceLoading />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (ensure.isError) return <div className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] p-6"><div className="max-w-md rounded-2xl border border-[#e3ddd2] bg-[#fbf8f1] p-8 text-center"><h1 className="font-display text-2xl font-bold">We couldn’t open your workspace</h1><p className="mt-2 text-sm text-[#72777d]">Your account profile could not be prepared. Please try again.</p><button className="mt-5 rounded-xl bg-[#283442] px-5 py-3 text-sm font-bold text-white" onClick={() => { attemptedFor.current = null; ensure.mutate({ data: { email: user?.primaryEmailAddress?.emailAddress ?? '', name: user?.fullName || 'Team member' } }); }} data-testid="button-retry-profile">Try again</button></div></div>;
  const activeMember = syncedMember ?? ensure.data;
  if (!activeMember) return <WorkspaceLoading />;
  return <WorkspaceShell member={activeMember}><Switch><Route path="/board" component={() => <BoardPage member={activeMember} onMemberUpdated={setSyncedMember} />} /><Route path="/team" component={() => <TeamPage member={activeMember} onMemberUpdated={setSyncedMember} />} /><Route component={NotFound} /></Switch></WorkspaceShell>;
}

function WorkspaceLoading() {
  return <div className="min-h-[100dvh] bg-[#f5f1e8] p-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-12 w-48 rounded-xl bg-[#e6dfd2]" /><div className="mt-12 h-28 rounded-2xl bg-[#e9e2d7]" /><div className="mt-8 grid gap-5 md:grid-cols-3">{[1, 2, 3].map(x => <div key={x} className="h-[360px] rounded-2xl bg-[#e9e2d7]" />)}</div></div></div>;
}

function WorkspaceShell({ member, children }: { member: TeamMember; children: ReactNode }) {
  const { signOut } = useClerk();
  const [location] = useLocation();
  return <div className="min-h-[100dvh] bg-[#f5f1e8] md:flex">
    <aside className="flex flex-row items-center justify-between bg-[#283442] px-5 py-3 text-[#f6f2e9] md:min-h-[100dvh] md:w-[246px] md:flex-col md:items-stretch md:justify-start md:px-5 md:py-7">
      <Link href="/board" className="flex items-center gap-3" data-testid="link-workspace-brand"><span className="grid size-10 place-items-center rounded-xl bg-[#3a4857] text-[#f3ab88]"><Layers3 size={19} /></span><span className="font-display text-lg font-extrabold tracking-[-.05em]">goodwork<span className="text-[#f0a17c]">.</span></span></Link>
      <nav className="flex items-center gap-1 md:hidden" aria-label="Workspace navigation">
        {[{ href: '/board', label: 'Board' }, { href: '/team', label: 'Team' }].map(item => <Link key={item.href} href={item.href} className={`rounded-lg px-2.5 py-2 text-[10px] font-bold ${location === item.href ? 'bg-[#3b4956] text-white' : 'text-[#c3c8c5]'}`} data-testid={`mobile-link-nav-${item.label.toLowerCase()}`}>{item.label}</Link>)}
      </nav>
      <div className="hidden md:block md:mt-12"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#9ca5a9]">Workspace</p>
        <nav className="space-y-1">
          {[{ href: '/board', label: 'Task board' }, { href: '/team', label: 'Team' }].map(item => <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${location === item.href ? 'bg-[#3b4956] text-white' : 'text-[#c3c8c5] hover:bg-[#344250] hover:text-white'}`} data-testid={`link-nav-${item.label.toLowerCase().replace(' ', '-')}`}><span className={`size-1.5 rounded-full ${location === item.href ? 'bg-[#efa27f]' : 'bg-[#6c7a82]'}`} />{item.label}</Link>)}
        </nav>
      </div>
      <div className="flex items-center gap-2 md:mt-auto md:flex-col md:items-stretch md:gap-4">
        <div className="hidden rounded-xl border border-[#485460] bg-[#303e4b] p-3 md:block"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#aeb6b8]">Your account</p><p className="mt-2 truncate text-sm font-semibold">{member.name}</p><p className="mt-0.5 truncate text-[11px] text-[#aeb6b8]">{member.email}</p><span className="mt-3 inline-flex rounded-full bg-[#46575f] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#d4e0db]">{member.role}</span></div>
        <span className="hidden text-xs font-semibold text-[#d5dbd5] md:block">A good place to get things done.</span>
        <button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg border border-[#53606a] px-3 py-2 text-xs font-bold text-[#e0e2dc] transition hover:bg-[#394755]" data-testid="button-sign-out">Sign out</button>
      </div>
    </aside>
    <main className="min-w-0 flex-1 px-5 py-6 md:px-10 md:py-9">{children}</main>
  </div>;
}

function SignInPage() {
  return <div className="clerk-theme flex min-h-[100dvh] items-center justify-center bg-[#f5f1e8] px-4 py-10"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}
function SignUpPage() {
  return <div className="clerk-theme flex min-h-[100dvh] items-center justify-center bg-[#f5f1e8] px-4 py-10"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function CacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) cache.clear();
    previous.current = id;
  }), [addListener, cache]);
  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{
    signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to get your team moving.' } },
    signUp: { start: { title: 'Start your workspace', subtitle: 'Create an account for your agency board.' } },
  }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider><CacheInvalidator /><RoutedErrorBoundary><Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/board" component={SignedInWorkspace} />
        <Route path="/team" component={SignedInWorkspace} />
        <Route component={NotFound} />
      </Switch></RoutedErrorBoundary><Toaster /></TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkRoutes /></WouterRouter>;
}

export default App;
