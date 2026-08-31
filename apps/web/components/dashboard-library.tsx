'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { Surface } from '@cloudflare/kumo/components/surface';
import {
  ClockCounterClockwise,
  DotsThree,
  FileText,
  Folders,
  MagnifyingGlass,
  SealCheck,
  UsersThree,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

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
    accepted: SealCheck,
    drafts: FileText,
    recents: ClockCounterClockwise,
    search: MagnifyingGlass,
    shared: UsersThree,
    space: Folders,
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
    <main className="library-shell">
      <Surface render={<aside />} className="library-sidebar">
        <Link className="library-wordmark" href="/">
          <span>AT</span>
          <strong>Attune</strong>
        </Link>
        <div className="library-search">
          <LibraryIcon name="search" />
          <Input
            aria-label="Search files"
            size="sm"
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>/</kbd>
        </div>
        <nav className="library-navigation" aria-label="Project library">
          {navigation.map((item) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              key={item.id}
              className={filter === item.id ? 'is-active' : undefined}
              onClick={() => setFilter(item.id)}
              icon={<LibraryIcon name={item.id} />}
            >
              <span>{item.label}</span>
            </Button>
          ))}
        </nav>
        <div className="library-space-list">
          <div className="library-section-label">
            <span>Spaces</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              shape="square"
              icon={<DotsThree size={16} weight="bold" />}
              aria-label="Space actions"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="is-current"
            icon={<LibraryIcon name="space" />}
          >
            <span>Demo fabrication</span>
          </Button>
        </div>
        <div className="library-user">
          <span className="library-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{displayName}</strong>
            <span>Attune workspace</span>
          </div>
        </div>
      </Surface>

      <section className="library-content">
        <header className="library-header">
          <div>
            <p>Attune project library</p>
            <h1>{activeLabel}</h1>
          </div>
          <div className="library-header-state">
            <span className="status-dot is-synced" />
            <span>Authoritative workspace synced</span>
          </div>
        </header>

        <section className="guided-scenario" aria-labelledby="guided-scenario-title">
          <div className="guided-marker">AT-1042</div>
          <div>
            <span>Guided manufacturing scenario</span>
            <h2 id="guided-scenario-title">Make the control-enclosure faceplate buildable.</h2>
            <p>
              Resolve a connector-slot clearance conflict while preserving four buyer-locked mounts,
              then advance the exact revision to quote and commerce.
            </p>
          </div>
          {files[0] ? (
            <Link href={`/workspace/${encodeURIComponent(files[0].workspaceId)}`}>
              Open workspace
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </section>

        <div className="library-list-heading">
          <div>
            <h2>Projects and files</h2>
            <span>{visibleFiles.length} shown</span>
          </div>
          <span>Last activity</span>
        </div>
        <section className="library-file-grid" aria-label={`${activeLabel} files`}>
          {visibleFiles.map((file) => (
            <Link
              className="library-file"
              href={`/workspace/${encodeURIComponent(file.workspaceId)}`}
              key={file.workspaceId}
            >
              <div className="library-file-preview">
                <PanelPreview valid={file.valid} />
                <span className={`library-file-stage ${file.valid ? 'is-valid' : 'is-conflict'}`}>
                  {fileStage(file)}
                </span>
              </div>
              <div className="library-file-meta">
                <div>
                  <span>{file.projectCode}</span>
                  <h3>{file.projectName}</h3>
                  <p>{file.fileName}</p>
                </div>
                <div className="library-file-facts">
                  <span>Draft r{file.draftVersion}</span>
                  <span>
                    {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
                      new Date(file.updatedAt),
                    )}
                  </span>
                  <div className="mini-avatars" aria-label="Collaborators">
                    {file.collaborators.slice(0, 3).map((name) => (
                      <span key={name}>{name.slice(0, 1)}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {visibleFiles.length === 0 ? (
            <div className="library-empty">
              <span>No matching files</span>
              <p>Try a different library section or clear the search.</p>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
