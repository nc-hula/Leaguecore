// Typed fetch wrappers for all server endpoints.
// 401 responses redirect to /login automatically.

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status });
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── Inline types ────────────────────────────────────────────────────────────

export interface User { id: string; displayName: string; email: string; }

export interface League {
  id: string; name: string; mediaTypeName: string; mediaTypeEmoji: string;
  revealMode: string; submissionSources: string[];
}

export interface Round {
  id: string; leagueId: string; theme: string; description: string;
  requiredEntryCount: number; bonusTracksAllowed: boolean;
  deadlineMode: string; phase: string;
  submissionDeadline?: string; votingDeadline?: string;
  mediaTypeName: string; mediaTypeEmoji: string;
  submissionSources: string[]; weight: number;
}

export interface EntryResponse {
  id: string; roundId: string; title: string; sourceUrl: string;
  source: string; embedHtml: string; thumbnailUrl: string | null;
  isBonusTrack: boolean; contextComment: string | null;
  submitterDisplayName?: string; threadStarterComment?: string | null;
}

export interface BallotItem { entryId: string; rankPosition: number; }

export interface BallotResponse {
  roundId: string; voterId: string; submittedAt: string; items: BallotItem[];
}

export interface MemberRow {
  userId: string; displayName: string; email: string; role: string; joinedAt: string;
}

export interface RoundResultResponse {
  entryId: string; entryTitle: string; submitterDisplayName: string;
  finalRank: number; finalScore: number; sourceUrl: string;
  source: string; thumbnailUrl: string | null; isBonusTrack: boolean;
}

export interface StandingsEntry { rank: number; userId: string; displayName: string; finalScore: number; }

export interface StandingsResponse { standings: StandingsEntry[]; }

export interface CommentResponse {
  id: string; entryId: string; authorId: string;
  authorDisplayName: string; body: string; createdAt: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const getMe = () => apiFetch<User>('/auth/me');
export const logout = () => apiFetch<void>('/auth/logout', { method: 'POST' });

// ─── Leagues ─────────────────────────────────────────────────────────────────

export const createLeague = (data: { name: string; mediaTypeName?: string; mediaTypeEmoji?: string; revealMode?: string }) =>
  apiFetch<League>('/api/leagues', { method: 'POST', body: JSON.stringify(data) });

export const listLeagues = () => apiFetch<League[]>('/api/leagues');

export const getLeague = (id: string) => apiFetch<League>(`/api/leagues/${id}`);

export const updateLeague = (id: string, data: Partial<{ name: string; mediaTypeName: string; mediaTypeEmoji: string; revealMode: string; submissionSources: string[] }>) =>
  apiFetch<League>(`/api/leagues/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const getInviteUrl = (id: string) => apiFetch<{ inviteUrl: string }>(`/api/leagues/${id}/invite`);

export const joinLeague = (token: string) =>
  apiFetch<{ message: string; alreadyMember?: boolean }>(`/api/leagues/join/${token}`, { method: 'POST' });

export const listMembers = (leagueId: string) => apiFetch<MemberRow[]>(`/api/leagues/${leagueId}/members`);

export const removeMember = (leagueId: string, userId: string) =>
  apiFetch<void>(`/api/leagues/${leagueId}/members/${userId}`, { method: 'DELETE' });

export const grantAdmin = (leagueId: string, userId: string) =>
  apiFetch<void>(`/api/leagues/${leagueId}/members/${userId}/admin`, { method: 'PUT' });

export const getLeagueStandings = (leagueId: string) =>
  apiFetch<StandingsResponse>(`/api/leagues/${leagueId}/standings`);

// ─── Rounds ──────────────────────────────────────────────────────────────────

export const createRound = (leagueId: string, data: object) =>
  apiFetch<Round>(`/api/leagues/${leagueId}/rounds`, { method: 'POST', body: JSON.stringify(data) });

export const listRounds = (leagueId: string) => apiFetch<Round[]>(`/api/leagues/${leagueId}/rounds`);

export const getRound = (leagueId: string, roundId: string) =>
  apiFetch<Round>(`/api/leagues/${leagueId}/rounds/${roundId}`);

export const advanceRound = (leagueId: string, roundId: string) =>
  apiFetch<Round>(`/api/leagues/${leagueId}/rounds/${roundId}/advance`, { method: 'POST' });

export const getRoundResults = (leagueId: string, roundId: string) =>
  apiFetch<RoundResultResponse[]>(`/api/leagues/${leagueId}/rounds/${roundId}/results`);

// ─── Entries ─────────────────────────────────────────────────────────────────

export const submitEntry = (roundId: string, data: { url: string; contextComment?: string; threadStarterComment?: string }) =>
  apiFetch<EntryResponse>(`/api/rounds/${roundId}/entries`, { method: 'POST', body: JSON.stringify(data) });

export const listEntries = (roundId: string) => apiFetch<EntryResponse[]>(`/api/rounds/${roundId}/entries`);

// ─── Ballot ──────────────────────────────────────────────────────────────────

export const submitBallot = (roundId: string, data: { items: BallotItem[] }) =>
  apiFetch<BallotResponse>(`/api/rounds/${roundId}/ballot`, { method: 'PUT', body: JSON.stringify(data) });

export const getBallot = (roundId: string) => apiFetch<BallotResponse>(`/api/rounds/${roundId}/ballot`);

// ─── Comments ────────────────────────────────────────────────────────────────

export const postComment = (roundId: string, entryId: string, body: string) =>
  apiFetch<CommentResponse>(`/api/rounds/${roundId}/entries/${entryId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });

export const listComments = (roundId: string, entryId: string) =>
  apiFetch<CommentResponse[]>(`/api/rounds/${roundId}/entries/${entryId}/comments`);
