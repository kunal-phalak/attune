'use client';

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
  if (name === 'search') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m12.5 12.5 4 4" />
      </svg>
    );
  }
  if (name === 'space') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M3 5.5h5l1.4 1.8H17v8.2H3z" />
      </svg>
    );
  }
  if (name === 'drafts') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M4 3.5h8l4 4v9H4zM12 3.5v4h4" />
      </svg>
    );
  }
  if (name === 'shared') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="14" cy="8" r="2" />
        <path d="M2.8 16c.4-3 2-4.5 4.3-4.5s4 1.5 4.3 4.5M11.5 12.4c2.8-.6 4.6.6 5.1 3.6" />
      </svg>
    );
  }
  if (name === 'accepted') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M10 2.8 16 6v5.5c0 3-2.1 5-6 6.2-3.9-1.2-6-3.2-6-6.2V6z" />
        <path d="m7 10.3 2 2 4-4.2" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 4.5h12v11H4zM7 2.5v4M13 2.5v4" />
    </svg>
  );
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
      <aside className="library-sidebar">
        <Link className="library-wordmark" href="/">
          <span>AT</span>
          <strong>Attune</strong>
        </Link>
        <label className="library-search">
          <LibraryIcon name="search" />
          <span className="visually-hidden">Search files</span>
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>/</kbd>
        </label>
        <nav className="library-navigation" aria-label="Project library">
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? 'is-active' : undefined}
              onClick={() => setFilter(item.id)}
            >
              <LibraryIcon name={item.id} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="library-space-list">
          <div className="library-section-label">
            <span>Spaces</span>
            <button type="button" aria-label="Space actions">
              ···
            </button>
          </div>
          <button type="button" className="is-current">
            <LibraryIcon name="space" />
            <span>Demo fabrication</span>
          </button>
        </div>
        <div className="library-user">
          <span className="library-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{displayName}</strong>
            <span>Attune workspace</span>
          </div>
        </div>
      </aside>

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
