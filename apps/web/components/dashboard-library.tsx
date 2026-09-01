'use client';

import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Input } from '@cloudflare/kumo/components/input';
import { Surface } from '@cloudflare/kumo/components/surface';
import { LiveblocksProvider, RoomProvider } from '@liveblocks/react';
import { AvatarStack } from '@liveblocks/react-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { workspaceUserResolver } from '../lib/liveblocks/resolve-users';
import {
  filterLibraryProjects,
  type LibraryFilter,
  type LibraryProject,
  type SketchTemplate,
} from '../lib/projects/library';
import { attuneToastManager } from './attune-ui-provider';
import { AppIcons } from './ui/app-icons';

export type AttuneLibraryFile = LibraryProject;

const navigation: readonly { readonly id: LibraryFilter; readonly label: string }[] = [
  { id: 'recents', label: 'Recents' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'shared', label: 'Shared with me' },
];

function ProjectThumbnail({ template }: { readonly template: SketchTemplate }) {
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
    <svg
      viewBox="0 0 320 188"
      preserveAspectRatio="xMidYMid slice"
      aria-label={template === 'spoke' ? 'Spoke sketch thumbnail' : 'Blank sketch thumbnail'}
    >
      <defs>
        <pattern
          id={`project-thumbnail-grid-${template}`}
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <path d="M16 0H0V16" />
        </pattern>
      </defs>
      <rect className="spoke-thumbnail-background" width="320" height="188" />
      <rect
        className="spoke-thumbnail-grid"
        width="320"
        height="188"
        fill={`url(#project-thumbnail-grid-${template})`}
      />
      {template === 'spoke' ? (
        <g className="spoke-thumbnail-geometry">
          <circle cx="160" cy="94" r="82" />
          <circle cx="160" cy="94" r="75" />
          <circle cx="160" cy="94" r="31" />
          <circle cx="160" cy="94" r="13" />
          {spokes.map(({ id, ...spoke }) => (
            <line key={id} {...spoke} />
          ))}
        </g>
      ) : null}
    </svg>
  );
}

function ProjectCardBody({
  project,
  collaboration,
}: {
  readonly project: LibraryProject;
  readonly collaboration: boolean;
}) {
  return (
    <Link
      className="dashboard-project-card"
      href={`/workspace/${encodeURIComponent(project.workspaceId)}`}
    >
      <div className="dashboard-project-thumbnail">
        <ProjectThumbnail template={project.template} />
      </div>
      <div className="dashboard-project-meta">
        <div>
          <h2>{project.projectName}</h2>
          <span className="dashboard-draft-label">Draft</span>
        </div>
        <div className="dashboard-project-activity">
          <time dateTime={project.updatedAt}>
            Edited{' '}
            {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
              new Date(project.updatedAt),
            )}
          </time>
          {collaboration ? <AvatarStack max={4} size={25} /> : null}
        </div>
      </div>
    </Link>
  );
}

function ProjectCard({
  project,
  collaboration,
  user,
}: {
  readonly project: LibraryProject;
  readonly collaboration: boolean;
  readonly user: { readonly id: string; readonly name: string };
}) {
  const resolver = useMemo(() => workspaceUserResolver(project.roomId), [project.roomId]);
  if (!collaboration) return <ProjectCardBody project={project} collaboration={false} />;
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" resolveUsers={resolver}>
      <RoomProvider
        id={project.roomId}
        initialPresence={{
          cursor: null,
          selection: [],
          currentTool: 'dashboard',
          activeActor: { id: user.id, name: user.name, role: 'buyer' },
        }}
      >
        <ProjectCardBody project={project} collaboration />
      </RoomProvider>
    </LiveblocksProvider>
  );
}

function projectResponse(value: unknown): {
  readonly workspaceId?: string;
  readonly error?: string;
} {
  if (typeof value !== 'object' || value === null) return {};
  const workspaceId = Reflect.get(value, 'workspaceId');
  const error = Reflect.get(value, 'error');
  return {
    workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined,
    error: typeof error === 'string' ? error : undefined,
  };
}

async function requestProject(template: SketchTemplate): Promise<string> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template }),
  });
  const result = projectResponse(await response.json());
  if (!response.ok || !result.workspaceId) {
    throw new Error(result.error || 'Project creation failed.');
  }
  return result.workspaceId;
}

function NewProjectDialog({ canCreate }: { readonly canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<SketchTemplate | null>(null);

  const createProject = async (template: SketchTemplate) => {
    setCreating(template);
    try {
      const workspaceId = await requestProject(template);
      setOpen(false);
      router.push(`/workspace/${encodeURIComponent(workspaceId)}`);
      router.refresh();
    } catch (error) {
      attuneToastManager.add({
        title: 'Project not created',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setCreating(null);
    }
  };

  if (!canCreate) return null;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<AppIcons.New size={17} weight="bold" />}
          >
            New project
          </Button>
        }
      />
      <Dialog size="base" className="dashboard-new-project-dialog">
        <Dialog.Title>New project</Dialog.Title>
        <Dialog.Description>
          Start with an empty XY sketch or a simple radial example.
        </Dialog.Description>
        <div className="dashboard-template-actions">
          <Button
            type="button"
            variant="secondary"
            icon={<AppIcons.File size={19} />}
            disabled={creating !== null}
            loading={creating === 'blank'}
            onClick={() => void createProject('blank')}
          >
            Blank sketch
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={<AppIcons.Brand size={19} />}
            disabled={creating !== null}
            loading={creating === 'spoke'}
            onClick={() => void createProject('spoke')}
          >
            Spoke example
          </Button>
        </div>
        <Dialog.Close
          render={
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          }
        />
      </Dialog>
    </Dialog.Root>
  );
}

function EmptyLibrary({
  filtered,
  canCreate,
  onCreate,
}: {
  readonly filtered: boolean;
  readonly canCreate: boolean;
  readonly onCreate: (template: SketchTemplate) => void;
}) {
  if (filtered) return <p className="dashboard-empty">No projects match this view.</p>;
  return (
    <Surface render={<section />} className="dashboard-first-project">
      <AppIcons.Sketch size={24} weight="regular" />
      <h2>Start your first sketch</h2>
      <p>Create an empty XY workspace or open the radial spoke example.</p>
      {canCreate ? (
        <div>
          <Button type="button" variant="primary" onClick={() => onCreate('blank')}>
            Create blank project
          </Button>
          <Button type="button" variant="secondary" onClick={() => onCreate('spoke')}>
            Open Spoke example
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}

export function DashboardLibrary({
  files,
  collaboration,
  user,
  filter,
  canCreate,
}: {
  readonly files: readonly AttuneLibraryFile[];
  readonly collaboration: boolean;
  readonly user: { readonly id: string; readonly name: string };
  readonly filter: LibraryFilter;
  readonly canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const visibleFiles = useMemo(
    () => filterLibraryProjects(files, filter, query),
    [files, filter, query],
  );
  const activeLabel = navigation.find((item) => item.id === filter)?.label ?? 'Recents';

  const createFromEmpty = async (template: SketchTemplate) => {
    try {
      const workspaceId = await requestProject(template);
      router.push(`/workspace/${encodeURIComponent(workspaceId)}`);
      router.refresh();
    } catch (error) {
      attuneToastManager.add({
        title: 'Project not created',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      });
    }
  };

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
            <LinkButton
              key={item.id}
              href={`/dashboard?view=${item.id}`}
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
            >
              {item.label}
            </LinkButton>
          ))}
        </nav>
      </aside>
      <section className="dashboard-library" aria-label="Projects">
        <header>
          <h1>{activeLabel}</h1>
          <NewProjectDialog canCreate={canCreate} />
        </header>
        {visibleFiles.length > 0 ? (
          <div className="dashboard-project-grid">
            {visibleFiles.map((project) => (
              <ProjectCard
                key={project.workspaceId}
                project={project}
                collaboration={collaboration}
                user={user}
              />
            ))}
          </div>
        ) : (
          <EmptyLibrary
            filtered={files.length > 0 || query.length > 0 || filter !== 'recents'}
            canCreate={canCreate}
            onCreate={(template) => void createFromEmpty(template)}
          />
        )}
      </section>
    </main>
  );
}
