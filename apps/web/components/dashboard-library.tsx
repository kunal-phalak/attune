'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { Surface } from '@cloudflare/kumo/components/surface';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AppIcons } from './ui/app-icons';
import { AppScrollArea } from './ui/app-scroll-area';

export interface AttuneLibraryFile {
  readonly workspaceId: string;
  readonly projectName: string;
  readonly projectCode: string;
  readonly workspaceName: string;
  readonly fileName: string;
  readonly draftVersion: number;
  readonly updatedAt: string;
  readonly valid: boolean;
  readonly frozen: boolean;
  readonly accepted: boolean;
  readonly verified: boolean;
  readonly collaborators: readonly string[];
}

type LibraryFilter = 'recents' | 'drafts' | 'shared' | 'accepted';

const navigation: readonly { readonly id: LibraryFilter; readonly label: string }[] = [
  { id: 'recents', label: 'Recents' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'shared', label: 'Shared with me' },
  { id: 'accepted', label: 'Accepted / Frozen' },
];

function LibraryIcon({ name }: { readonly name: LibraryFilter | 'space' | 'search' }) {
  const Icon = {
    accepted: AppIcons.Accepted,
    drafts: AppIcons.File,
    recents: AppIcons.History,
    search: AppIcons.Search,
    shared: AppIcons.Collaborators,
    space: AppIcons.Projects,
  }[name];
  return <Icon aria-hidden size={20} weight="regular" />;
}

function fileStage(file: AttuneLibraryFile): string {
  if (file.verified) return 'Shopify verified';
  if (file.accepted) return 'Accepted';
  if (file.frozen) return 'Frozen';
  if (file.valid) return 'Buildable';
  return 'Conflict to resolve';
}

function filterFiles(files: readonly AttuneLibraryFile[], filter: LibraryFilter, query: string) {
  const normalized = query.trim().toLowerCase();
  return files.filter((file) => {
    const matchesQuery =
      normalized.length === 0 ||
      [file.projectName, file.projectCode, file.workspaceName, file.fileName]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    const matchesFilter =
      filter === 'recents' ||
      filter === 'shared' ||
      (filter === 'drafts' && !file.frozen) ||
      (filter === 'accepted' && (file.frozen || file.accepted));
    return matchesQuery && matchesFilter;
  });
}

function PanelPreview({ valid }: { readonly valid: boolean }) {
  return (
    <svg viewBox="0 0 520 270" aria-hidden="true">
      <defs>
        <pattern id="library-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M18 0H0V18" />
        </pattern>
      </defs>
      <rect className="library-preview-grid" width="520" height="270" />
      <g transform="translate(72 46)">
        <rect className="library-panel-outline" width="376" height="178" rx="8" />
        {[
          [34, 34],
          [342, 34],
          [34, 144],
          [342, 144],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle className="library-mount" cx={x} cy={y} r="7" />
            <path className="library-lock-tick" d={`M${x - 4} ${y - 12}v-3a4 4 0 0 1 8 0v3`} />
          </g>
        ))}
        <circle className="library-feature" cx="144" cy="62" r="9" />
        <circle className="library-feature" cx="144" cy="116" r="9" />
        <rect
          className={valid ? 'library-slot' : 'library-slot is-conflict'}
          x={304}
          y={77}
          width="52"
          height="24"
          rx="12"
        />
        {!valid ? <path className="library-conflict-gap" d="M362 77v24" /> : null}
      </g>
    </svg>
  );
}

export function DashboardLibrary({
  files,
  displayName,
}: {
  readonly files: readonly AttuneLibraryFile[];
  readonly displayName: string;
}) {
  const [filter, setFilter] = useState<LibraryFilter>('recents');
  const [query, setQuery] = useState('');
  const visibleFiles = useMemo(() => filterFiles(files, filter, query), [files, filter, query]);
  const activeLabel = navigation.find(({ id }) => id === filter)?.label ?? 'Recents';

  return (
    <main className="grid min-h-dvh min-w-0 grid-cols-1 bg-kumo-canvas text-kumo-contrast md:h-dvh md:grid-cols-[248px_minmax(0,1fr)] md:overflow-hidden">
      <Surface
        render={<aside />}
        className="flex min-h-0 min-w-0 flex-col border-b border-kumo-line bg-kumo-base md:border-r md:border-b-0"
      >
        <Link
          className="flex h-16 items-center gap-3 border-b border-kumo-line px-5 no-underline"
          href="/"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-kumo-contrast text-xs font-bold tracking-wider text-kumo-base">
            AT
          </span>
          <strong className="text-sm font-semibold">Attune</strong>
        </Link>
        <div className="relative mx-3 mt-3 flex items-center gap-2 text-kumo-subtle">
          <LibraryIcon name="search" />
          <Input
            aria-label="Search files"
            size="sm"
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="absolute right-2 rounded border border-kumo-line bg-kumo-recessed px-1.5 py-0.5 text-[10px] text-kumo-subtle">
            /
          </kbd>
        </div>
        <AppScrollArea className="min-h-0 flex-1" ariaLabel="Project library navigation">
          <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Project library">
            {navigation.map((item) => (
              <Button
                type="button"
                variant={filter === item.id ? 'secondary' : 'ghost'}
                size="sm"
                key={item.id}
                className="w-full justify-start"
                onClick={() => setFilter(item.id)}
                icon={<LibraryIcon name={item.id} />}
              >
                <span>{item.label}</span>
              </Button>
            ))}
          </nav>
          <div className="border-t border-kumo-line px-3 py-4">
            <div className="mb-2 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-wider text-kumo-subtle">
              <span>Spaces</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                shape="square"
                icon={<AppIcons.More size={16} weight="bold" />}
                aria-label="Space actions"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              icon={<LibraryIcon name="space" />}
            >
              <span>Demo fabrication</span>
            </Button>
          </div>
        </AppScrollArea>
        <div className="flex items-center gap-3 border-t border-kumo-line px-4 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-kumo-brand text-xs font-bold text-white">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <strong className="block truncate text-sm">{displayName}</strong>
            <span className="block truncate text-xs text-kumo-subtle">Attune workspace</span>
          </div>
        </div>
      </Surface>

      <AppScrollArea className="min-h-0 min-w-0" ariaLabel="Project files">
        <section className="mx-auto w-full max-w-[1500px] px-5 py-6 md:px-8 md:py-8">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-kumo-line pb-5">
            <div>
              <p className="m-0 text-xs font-medium text-kumo-subtle">Attune project library</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{activeLabel}</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-kumo-subtle">
              <span className="size-2 rounded-full bg-attune-valid" />
              <span>Authoritative workspace synced</span>
            </div>
          </header>

          <section
            className="mt-6 grid gap-4 rounded-xl border border-kumo-line bg-kumo-base p-5 shadow-sm md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
            aria-labelledby="guided-scenario-title"
          >
            <div className="grid size-14 place-items-center rounded-xl bg-kumo-contrast text-xs font-bold tracking-wider text-kumo-base">
              AT-1042
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-kumo-brand">
                Guided manufacturing scenario
              </span>
              <h2 className="mt-1 text-lg font-semibold" id="guided-scenario-title">
                Make the control-enclosure faceplate buildable.
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-kumo-subtle">
                Resolve a connector-slot clearance conflict while preserving four buyer-locked
                mounts, then advance the exact revision to quote and commerce.
              </p>
            </div>
            {files[0] ? (
              <Link
                className="inline-flex items-center gap-2 text-sm font-semibold text-kumo-brand no-underline hover:underline"
                href={`/workspace/${encodeURIComponent(files[0].workspaceId)}`}
              >
                Open workspace
                <AppIcons.Open aria-hidden size={16} weight="bold" />
              </Link>
            ) : null}
          </section>

          <div className="mt-8 flex items-end justify-between gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-base font-semibold">Projects and files</h2>
              <span className="text-xs text-kumo-subtle">{visibleFiles.length} shown</span>
            </div>
            <span className="hidden text-xs text-kumo-subtle sm:block">Last activity</span>
          </div>
          <section
            className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
            aria-label={`${activeLabel} files`}
          >
            {visibleFiles.map((file) => (
              <Link
                className="group min-w-0 overflow-hidden rounded-xl border border-kumo-line bg-kumo-base no-underline shadow-sm transition-colors duration-100 hover:border-kumo-interact"
                href={`/workspace/${encodeURIComponent(file.workspaceId)}`}
                key={file.workspaceId}
              >
                <div className="relative aspect-[16/8.5] overflow-hidden border-b border-kumo-line [&>svg]:size-full">
                  <PanelPreview valid={file.valid} />
                  <span
                    className={`absolute top-3 right-3 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${file.valid ? 'border-attune-valid/30 bg-attune-valid/10 text-attune-valid' : 'border-attune-conflict/30 bg-attune-conflict/10 text-attune-conflict'}`}
                  >
                    {fileStage(file)}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-kumo-subtle">
                      {file.projectCode}
                    </span>
                    <h3 className="mt-1 truncate text-sm font-semibold">{file.projectName}</h3>
                    <p className="mt-0.5 truncate text-xs text-kumo-subtle">{file.fileName}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-kumo-subtle">
                    <span className="font-semibold text-kumo-contrast">
                      Draft r{file.draftVersion}
                    </span>
                    <span className="hidden sm:inline">
                      {new Intl.DateTimeFormat('en', {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      }).format(new Date(file.updatedAt))}
                    </span>
                    <div className="mt-1 flex -space-x-1" aria-label="Collaborators">
                      {file.collaborators.slice(0, 3).map((name) => (
                        <span
                          className="grid size-6 place-items-center rounded-full border-2 border-kumo-base bg-kumo-recessed text-[10px] font-semibold"
                          key={name}
                        >
                          {name.slice(0, 1)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {visibleFiles.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-kumo-line p-10 text-center">
                <span className="text-sm font-semibold">No matching files</span>
                <p className="mt-1 text-xs text-kumo-subtle">
                  Try a different library section or clear the search.
                </p>
              </div>
            ) : null}
          </section>
        </section>
      </AppScrollArea>
    </main>
  );
}
