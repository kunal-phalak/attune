'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Input } from '@cloudflare/kumo/components/input';
import { LiveblocksProvider, RoomProvider } from '@liveblocks/react';
import { AvatarStack } from '@liveblocks/react-ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { workspaceUserResolver } from '../lib/liveblocks/resolve-users';
import { AppIcons } from './ui/app-icons';

export interface AttuneLibraryFile {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly projectName: string;
  readonly updatedAt: string;
}

type LibraryFilter = 'recents' | 'drafts' | 'shared';

const navigation: readonly { readonly id: LibraryFilter; readonly label: string }[] = [
  { id: 'recents', label: 'Recents' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'shared', label: 'Shared with me' },
];

function ProjectThumbnail() {
  const spokes = Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    return {
      id: `spoke-${index + 1}`,
      x1: 160 + Math.cos(angle) * 31,
      y1: 94 - Math.sin(angle) * 31,
      x2: 160 + Math.cos(angle) * 75,
      y2: 94 - Math.sin(angle) * 75,
    };
  });
  return (
    <svg viewBox="0 0 320 188" aria-label="Spoke sketch thumbnail">
      <defs>
        <pattern id="spoke-thumbnail-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" />
        </pattern>
      </defs>
      <rect className="spoke-thumbnail-background" width="320" height="188" />
      <rect className="spoke-thumbnail-grid" width="320" height="188" />
      <g className="spoke-thumbnail-geometry">
        <circle cx="160" cy="94" r="82" />
        <circle cx="160" cy="94" r="75" />
        <circle cx="160" cy="94" r="31" />
        <circle cx="160" cy="94" r="13" />
        {spokes.map(({ id, ...spoke }) => (
          <line key={id} {...spoke} />
        ))}
      </g>
    </svg>
  );
}

function ProjectCard({
  file,
  collaboration,
}: {
  readonly file: AttuneLibraryFile;
  readonly collaboration: boolean;
}) {
  return (
    <Link
      className="dashboard-project-card"
      href={`/workspace/${encodeURIComponent(file.workspaceId)}`}
    >
      <div className="dashboard-project-thumbnail">
        <ProjectThumbnail />
      </div>
      <div className="dashboard-project-meta">
        <div>
          <h2>{file.projectName}</h2>
          <span className="dashboard-draft-label">Draft</span>
        </div>
        <div className="dashboard-project-activity">
          <time dateTime={file.updatedAt}>
            Edited{' '}
            {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
              new Date(file.updatedAt),
            )}
          </time>
          {collaboration ? <AvatarStack max={4} size={25} /> : null}
        </div>
      </div>
    </Link>
  );
}

function DashboardContent({
  files,
  collaboration,
}: {
  readonly files: readonly AttuneLibraryFile[];
  readonly collaboration: boolean;
}) {
  const [filter, setFilter] = useState<LibraryFilter>('recents');
  const [query, setQuery] = useState('');
  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return files.filter((file) => file.projectName.toLowerCase().includes(normalized));
  }, [files, query]);

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="dashboard-wordmark" href="/">
          <span>AT</span>
          <strong>Attune</strong>
        </Link>
        <label className="dashboard-search" htmlFor="dashboard-project-search">
          <AppIcons.Search size={18} weight="regular" aria-hidden />
          <Input
            id="dashboard-project-search"
            type="search"
            size="sm"
            value={query}
            placeholder="Search"
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search projects"
          />
        </label>
        <nav aria-label="Project library">
          {navigation.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={filter === item.id ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start"
              icon={
                item.id === 'recents' ? (
                  <AppIcons.History size={18} />
                ) : item.id === 'drafts' ? (
                  <AppIcons.File size={18} />
                ) : (
                  <AppIcons.Collaborators size={18} />
                )
              }
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </nav>
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<AppIcons.New size={17} weight="bold" />}
          disabled
          title="Project creation is not included in this foundation pass"
        >
          New project
        </Button>
      </aside>
      <section className="dashboard-library" aria-label="Projects">
        <header>
          <h1>{navigation.find((item) => item.id === filter)?.label}</h1>
        </header>
        <div className="dashboard-project-grid">
          {visibleFiles.map((file) => (
            <ProjectCard key={file.workspaceId} file={file} collaboration={collaboration} />
          ))}
          {visibleFiles.length === 0 ? (
            <p className="dashboard-empty">No projects match “{query}”.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export function DashboardLibrary({
  files,
  collaboration,
  user,
}: {
  readonly files: readonly AttuneLibraryFile[];
  readonly collaboration: boolean;
  readonly user: { readonly id: string; readonly name: string };
}) {
  const file = files[0];
  const resolver = useMemo(() => (file ? workspaceUserResolver(file.roomId) : undefined), [file]);
  if (!collaboration || !file || !resolver) {
    return <DashboardContent files={files} collaboration={false} />;
  }
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" resolveUsers={resolver}>
      <RoomProvider
        id={file.roomId}
        initialPresence={{
          cursor: null,
          selection: [],
          currentTool: 'dashboard',
          activeActor: { id: user.id, name: user.name, role: 'buyer' },
        }}
      >
        <DashboardContent files={files} collaboration />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
