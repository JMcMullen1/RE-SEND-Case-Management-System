import { useEffect, useRef, useState } from 'react';
import {
  OWNER_QUEUE_VALUES,
  STATUS_VALUES,
  TEAM_VALUES,
  type CaseListRow,
  type OwnerQueue,
  type Team,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { useSetStatus, useSetTeams } from '../../hooks/useCaseData';
import { CellMenu, MenuChoice, MenuHeading } from './CellMenu';
import { StatusChip, UnassignedChip } from './primitives';

type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

/** Staff: who the case is with, reassigned in place. */
export function StaffCell({
  row,
  users,
  onReassign,
}: {
  row: CaseListRow;
  users: UserSummary[];
  onReassign: (target: Target) => void;
}) {
  // Staff, A–Z by name (the API sorts too; this keeps it right regardless).
  const sortedUsers = [...users].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  const current =
    row.owner.kind === 'user' ? row.owner.displayName : row.owner.queue;
  return (
    <CellMenu
      label={`Staff: ${current}. Change`}
      trigger={
        row.owner.kind === 'user' ? (
          <span className="text-resend-ink">{row.owner.displayName}</span>
        ) : (
          <UnassignedChip queue={row.owner.queue} />
        )
      }
    >
      {(close) => (
        <>
          <MenuHeading>Assign to</MenuHeading>
          {sortedUsers.map((u) => (
            <MenuChoice
              key={u.id}
              current={row.owner.kind === 'user' && row.owner.userId === u.id}
              onChoose={() => {
                close();
                onReassign({ ownerUserId: u.id });
              }}
            >
              {u.displayName}
            </MenuChoice>
          ))}
          <div className="mt-1 border-t border-gray-100 pt-1">
            <MenuHeading>Queue</MenuHeading>
          </div>
          {OWNER_QUEUE_VALUES.map((q) => (
            <MenuChoice
              key={q}
              current={row.owner.kind === 'queue' && row.owner.queue === q}
              onChoose={() => {
                close();
                onReassign({ ownerQueue: q });
              }}
            >
              {q}
            </MenuChoice>
          ))}
        </>
      )}
    </CellMenu>
  );
}

/** Status: changed in place. */
export function StatusCell({ row }: { row: CaseListRow }) {
  const setStatus = useSetStatus();
  return (
    <CellMenu
      label={`Status: ${row.status}. Change`}
      trigger={<StatusChip status={row.status} />}
    >
      {(close) => (
        <>
          <MenuHeading>Status</MenuHeading>
          {STATUS_VALUES.map((s) => (
            <MenuChoice
              key={s}
              current={row.status === s}
              onChoose={() => {
                close();
                if (s !== row.status)
                  setStatus.mutate({ id: row.id, status: s });
              }}
            >
              {s}
            </MenuChoice>
          ))}
        </>
      )}
    </CellMenu>
  );
}

/**
 * Team: which teams the case sits with — more than one at once (a case can be
 * with TSA and ISA). Each tick saves straight away; the menu stays open.
 */
export function TeamCell({ row }: { row: CaseListRow }) {
  const setTeams = useSetTeams();
  // In the system's order, whatever order the server lists them in.
  const ordered = (codes: readonly string[]) =>
    TEAM_VALUES.filter((t) => codes.includes(t));
  // Ticks show at once. Saves go one after another, each sending the latest
  // set, and the list's copy is not taken back while any is still going — so
  // quick ticks are never lost or undone by a refresh.
  const [team, setTeam] = useState<Team[]>(() => ordered(row.team));
  const latest = useRef(team);
  const inFlight = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const failed = useRef(false);
  const rowTeam = useRef(row.team);
  rowTeam.current = row.team;
  const saved = ordered(row.team).join(',');
  useEffect(() => {
    if (inFlight.current > 0) return;
    const next = saved ? (saved.split(',') as Team[]) : [];
    latest.current = next;
    setTeam(next);
  }, [saved]);
  const toggle = (t: Team) => {
    const now = latest.current;
    const next = now.includes(t)
      ? now.filter((x) => x !== t)
      : TEAM_VALUES.filter((x) => x === t || now.includes(x));
    latest.current = next;
    setTeam(next);
    inFlight.current += 1;
    chain.current = chain.current
      .then(() => setTeams.mutateAsync({ id: row.id, team: latest.current }))
      .catch(() => {
        failed.current = true;
      })
      .finally(() => {
        inFlight.current -= 1;
        // A save failed: show what the case really has (the list put it back).
        if (inFlight.current === 0 && failed.current) {
          failed.current = false;
          latest.current = ordered(rowTeam.current);
          setTeam(latest.current);
        }
      });
  };
  return (
    <CellMenu
      role="dialog"
      label={`Team: ${team.join(', ') || 'none'}. Change`}
      trigger={
        team.length ? (
          <span className="text-resend-ink">{team.join(', ')}</span>
        ) : (
          <span className="text-gray-500">Add team</span>
        )
      }
    >
      {() => (
        <fieldset className="px-1 py-1">
          <legend className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Team
          </legend>
          {TEAM_VALUES.map((t) => (
            <label
              key={t}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-resend-ink hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={team.includes(t)}
                onChange={() => toggle(t)}
                className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
              />
              {t}
            </label>
          ))}
        </fieldset>
      )}
    </CellMenu>
  );
}
