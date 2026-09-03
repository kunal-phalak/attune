'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown';
import { Input } from '@cloudflare/kumo/components/input';
import { InputGroup } from '@cloudflare/kumo/components/input-group';
import { Loader } from '@cloudflare/kumo/components/loader';
import { Sidebar, useSidebar } from '@cloudflare/kumo/components/sidebar';
import { Surface } from '@cloudflare/kumo/components/surface';
import { LiveblocksProvider, RoomProvider } from '@liveblocks/react';
import { AvatarStack } from '@liveblocks/react-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { DASHBOARD_CHROME, dashboardChromeCssVariables } from '../lib/dashboard/dashboard-chrome';
import { workspaceUserResolver } from '../lib/liveblocks/resolve-users';
import {
  filterLibraryProjects,
  type LibraryFilter,
  type LibraryProject,
  type SketchTemplate,
} from '../lib/projects/library';
import { attuneToastManager } from './attune-ui-provider';
import { AppIcons } from './ui/app-icons';
import { AttuneBrandmark } from './ui/attune-brandmark';
import { AttuneEmptyState } from './ui/attune-empty-state';

export type AttuneLibraryFile = LibraryProject;

const navigation: readonly { readonly id: LibraryFilter; readonly label: string }[] = [
  { id: 'recents', label: 'Recents' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'shared', label: 'Shared with me' },
];

const DASHBOARD_SIDEBAR_STORAGE_KEY = 'attune:dashboard-sidebar-open';

function ProjectThumbnail({
  template,
  thumbnail,
  id = template,
}: {
  readonly template: SketchTemplate;
  readonly thumbnail?: LibraryProject['thumbnail'];
  readonly id?: string;
}) {
  const spokes = Array.from({ length: 6 }, (_, index) => {
    const angle = (index * Math.PI) / 3;
    return {
      id: `spoke-${index + 1}`,
      x1: Number((160 + Math.cos(angle) * 31).toFixed(3)),
      y1: Number((94 - Math.sin(angle) * 31).toFixed(3)),
      x2: Number((160 + Math.cos(angle) * 75).toFixed(3)),
      y2: Number((94 - Math.sin(angle) * 75).toFixed(3)),
    };
  });
  return (
    <svg
      viewBox="0 0 320 188"
      preserveAspectRatio="xMidYMid slice"
      aria-label={
        thumbnail?.entities.length ? 'Current design thumbnail' : 'Blank sketch thumbnail'
      }
    >
      <defs>
        <pattern
          id={`project-thumbnail-grid-${id.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`}
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
        fill={`url(#project-thumbnail-grid-${id.replaceAll(/[^a-zA-Z0-9_-]/g, '-')})`}
      />
      {thumbnail && thumbnail.entities.length > 0 ? (
        <g
          className="spoke-thumbnail-geometry"
          transform={`translate(160 94) scale(${148 / Math.max(1, thumbnail.bounds.maxX - thumbnail.bounds.minX, thumbnail.bounds.maxY - thumbnail.bounds.minY)} ${-148 / Math.max(1, thumbnail.bounds.maxX - thumbnail.bounds.minX, thumbnail.bounds.maxY - thumbnail.bounds.minY)}) translate(${-(thumbnail.bounds.minX + thumbnail.bounds.maxX) / 2} ${-(thumbnail.bounds.minY + thumbnail.bounds.maxY) / 2})`}
        >
          {thumbnail.entities.map((entity) => {
            if (entity.kind === 'line') {
              return (
                <line
                  key={entity.id}
                  x1={entity.start.x}
                  y1={entity.start.y}
                  x2={entity.end.x}
                  y2={entity.end.y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            if (entity.kind === 'circle') {
              return (
                <circle
                  key={entity.id}
                  cx={entity.center.x}
                  cy={entity.center.y}
                  r={entity.radius}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            if (entity.kind === 'arc') {
              return (
                <path
                  key={entity.id}
                  d={`M${entity.start.x} ${entity.start.y}A${entity.radius} ${entity.radius} 0 ${entity.largeArc ? 1 : 0} 1 ${entity.end.x} ${entity.end.y}`}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            return (
              <polyline
                key={entity.id}
                points={entity.points.map(({ x, y }) => `${x},${y}`).join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
      ) : template === 'spoke' ? (
        <g className="spoke-thumbnail-geometry">
          <circle cx="160" cy="94" r="82" />
          <circle cx="160" cy="94" r="75" />
          <circle cx="160" cy="94" r="31" />
          <circle cx="160" cy="94" r="13" />
          {spokes.map(({ id: spokeId, ...spoke }) => (
            <line key={spokeId} {...spoke} />
          ))}
        </g>
      ) : null}
    </svg>
  );
}

function projectManagementResponse(value: unknown): {
  readonly projectName?: string;
  readonly deleted?: boolean;
  readonly error?: string;
} {
  if (typeof value !== 'object' || value === null) return {};
  const projectName = Reflect.get(value, 'projectName');
  const deleted = Reflect.get(value, 'deleted');
  const error = Reflect.get(value, 'error');
  return {
    projectName: typeof projectName === 'string' ? projectName : undefined,
    deleted: deleted === true,
    error: typeof error === 'string' ? error : undefined,
  };
}

async function renameProject(workspaceId: string, name: string): Promise<string> {
  const response = await fetch(`/api/projects/${encodeURIComponent(workspaceId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const result = projectManagementResponse(await response.json());
  if (!response.ok || !result.projectName) {
    throw new Error(result.error || 'Project rename failed.');
  }
  return result.projectName;
}

async function deleteProject(workspaceId: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE',
  });
  const result = projectManagementResponse(await response.json());
  if (!response.ok || !result.deleted) {
    throw new Error(result.error || 'Project deletion failed.');
  }
}

function ProjectActions({
  project,
  onRenamed,
  onDeleted,
}: {
  readonly project: LibraryProject;
  readonly onRenamed: (workspaceId: string, projectName: string) => void;
  readonly onDeleted: (workspaceId: string) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(project.projectName);
  const [busy, setBusy] = useState<'rename' | 'delete' | null>(null);

  useEffect(() => setName(project.projectName), [project.projectName]);

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('rename');
    try {
      const projectName = await renameProject(project.workspaceId, name);
      onRenamed(project.workspaceId, projectName);
      setRenameOpen(false);
      attuneToastManager.add({ title: 'Project renamed', variant: 'success' });
    } catch (error) {
      attuneToastManager.add({
        title: 'Project not renamed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    setBusy('delete');
    try {
      await deleteProject(project.workspaceId);
      onDeleted(project.workspaceId);
      setDeleteOpen(false);
      attuneToastManager.add({ title: 'Project deleted', variant: 'success' });
    } catch (error) {
      attuneToastManager.add({
        title: 'Project not deleted',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              shape="square"
              icon={<AppIcons.More size={18} weight="bold" />}
              aria-label={`Actions for ${project.projectName}`}
            />
          }
        />
        <DropdownMenu.Content align="end" sideOffset={6}>
          <DropdownMenu.LinkItem
            href={`/workspace/${encodeURIComponent(project.workspaceId)}`}
            icon={AppIcons.Open}
          >
            Open
          </DropdownMenu.LinkItem>
          <DropdownMenu.Item icon={AppIcons.Rename} onClick={() => setRenameOpen(true)}>
            Rename
          </DropdownMenu.Item>
          <DropdownMenu.Item
            icon={AppIcons.Delete}
            variant="danger"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>

      <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
        <Dialog size="sm">
          <form className="dashboard-project-dialog" onSubmit={(event) => void submitRename(event)}>
            <Dialog.Title className="dashboard-dialog-title">Rename project</Dialog.Title>
            <Dialog.Description className="dashboard-dialog-description">
              Choose a concise name for this project.
            </Dialog.Description>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Project name"
              maxLength={80}
            />
            <div className="dashboard-dialog-actions">
              <Dialog.Close
                render={
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                }
              />
              <Button
                type="submit"
                variant="primary"
                loading={busy === 'rename'}
                disabled={busy !== null || name.trim().length === 0}
              >
                Rename
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog size="sm">
          <div className="dashboard-project-dialog">
            <Dialog.Title className="dashboard-dialog-title">
              Delete {project.projectName}?
            </Dialog.Title>
            <Dialog.Description className="dashboard-dialog-description">
              This removes the project from the library and cannot be undone.
            </Dialog.Description>
            <div className="dashboard-dialog-actions">
              <Dialog.Close
                render={
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                }
              />
              <Button
                type="button"
                variant="destructive"
                loading={busy === 'delete'}
                disabled={busy !== null}
                onClick={() => void confirmDelete()}
              >
                Delete project
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}

function ProjectCardBody({
  project,
  collaboration,
  onRenamed,
  onDeleted,
}: {
  readonly project: LibraryProject;
  readonly collaboration: boolean;
  readonly onRenamed: (workspaceId: string, projectName: string) => void;
  readonly onDeleted: (workspaceId: string) => void;
}) {
  const workspaceHref = `/workspace/${encodeURIComponent(project.workspaceId)}`;
  return (
    <Surface render={<article />} className="dashboard-project-card">
      <Link className="dashboard-project-thumbnail" href={workspaceHref}>
        <ProjectThumbnail
          template={project.template}
          thumbnail={project.thumbnail}
          id={project.workspaceId}
        />
      </Link>
      <div className="dashboard-project-meta">
        <div className="dashboard-project-identity">
          <Link href={workspaceHref}>
            <h2>{project.projectName}</h2>
          </Link>
          <span className="dashboard-draft-label">Draft</span>
        </div>
        <div className="dashboard-project-activity">
          <time dateTime={project.updatedAt}>
            Edited{' '}
            {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
              new Date(project.updatedAt),
            )}
          </time>
          <div className="dashboard-project-collaboration">
            {collaboration ? (
              <span className="dashboard-avatar-slot">
                <AvatarStack max={4} size={25} />
              </span>
            ) : null}
            {project.canManage ? (
              <ProjectActions project={project} onRenamed={onRenamed} onDeleted={onDeleted} />
            ) : null}
          </div>
        </div>
      </div>
    </Surface>
  );
}

function ProjectCard({
  project,
  collaboration,
  user,
  onRenamed,
  onDeleted,
}: {
  readonly project: LibraryProject;
  readonly collaboration: boolean;
  readonly user: { readonly id: string; readonly name: string };
  readonly onRenamed: (workspaceId: string, projectName: string) => void;
  readonly onDeleted: (workspaceId: string) => void;
}) {
  const resolver = useMemo(() => workspaceUserResolver(project.roomId), [project.roomId]);
  if (!collaboration) {
    return (
      <ProjectCardBody
        project={project}
        collaboration={false}
        onRenamed={onRenamed}
        onDeleted={onDeleted}
      />
    );
  }
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
        <ProjectCardBody
          project={project}
          collaboration
          onRenamed={onRenamed}
          onDeleted={onDeleted}
        />
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
          <Button type="button" variant="primary" size="base" icon={<AppIcons.New size={16} />}>
            New project
          </Button>
        }
      />
      <Dialog size="base" className="dashboard-new-project-dialog">
        <div className="dashboard-dialog-header">
          <Dialog.Title className="dashboard-dialog-title">New project</Dialog.Title>
          <Dialog.Close
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                shape="square"
                icon={<AppIcons.Close size={16} />}
                aria-label="Close new project dialog"
              />
            }
          />
        </div>
        <Dialog.Description className="dashboard-dialog-description">
          Choose a starting point.
        </Dialog.Description>
        <div className="dashboard-template-actions">
          <div className="dashboard-template-option-wrap">
            <Button
              type="button"
              variant="secondary"
              className="dashboard-template-option"
              disabled={creating !== null}
              aria-pressed={creating === 'blank'}
              onClick={() => void createProject('blank')}
            >
              <span className="dashboard-template-preview" aria-hidden>
                <ProjectThumbnail template="blank" />
              </span>
              <span>
                <strong>Blank sketch</strong>
                <small>Empty XY canvas</small>
              </span>
            </Button>
            {creating === 'blank' ? <LoaderSpinner /> : null}
          </div>
          <div className="dashboard-template-option-wrap">
            <Button
              type="button"
              variant="secondary"
              className="dashboard-template-option"
              disabled={creating !== null}
              aria-pressed={creating === 'spoke'}
              onClick={() => void createProject('spoke')}
            >
              <span className="dashboard-template-preview" aria-hidden>
                <ProjectThumbnail template="spoke" />
              </span>
              <span>
                <strong>Straight-spoke wheel</strong>
                <small>Editable mechanical wheel</small>
              </span>
            </Button>
            {creating === 'spoke' ? <LoaderSpinner /> : null}
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

function EmptyLibrary({
  filter,
  query,
  hasProjects,
  canCreate,
  onCreate,
}: {
  readonly filter: LibraryFilter;
  readonly query: string;
  readonly hasProjects: boolean;
  readonly canCreate: boolean;
  readonly onCreate: (template: SketchTemplate) => void;
}) {
  if (query.trim()) {
    return (
      <AttuneEmptyState
        media={<AppIcons.Search size={22} />}
        title={`No projects match “${query.trim()}”`}
        description="Try another project name."
      />
    );
  }
  if (filter === 'shared') {
    return (
      <AttuneEmptyState
        media={<AppIcons.Collaborators size={22} />}
        title="Nothing shared with you"
        description="Projects shared by collaborators will appear here."
      />
    );
  }
  if (filter === 'drafts') {
    return (
      <AttuneEmptyState
        media={<AppIcons.File size={22} />}
        title="No drafts yet"
        description="Projects you're still editing will appear here."
        actions={
          canCreate ? (
            <Button type="button" variant="primary" size="base" onClick={() => onCreate('blank')}>
              New project
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (hasProjects) {
    return (
      <AttuneEmptyState
        media={<AppIcons.History size={22} />}
        title="No recent projects"
        description="Projects you open will appear here."
      />
    );
  }
  return (
    <AttuneEmptyState
      media={<AppIcons.Sketch size={24} />}
      title="Start your first sketch"
      description="Create a blank project or open a straight-spoke wheel."
      actions={
        canCreate ? (
          <>
            <Button type="button" variant="primary" onClick={() => onCreate('blank')}>
              Create blank project
            </Button>
            <Button type="button" variant="secondary" onClick={() => onCreate('spoke')}>
              Open straight-spoke wheel
            </Button>
          </>
        ) : undefined
      }
    />
  );
}

function DashboardSidebar({
  filter,
  query,
  onQueryChange,
  searchRef,
  operationalWorkspaceId,
}: {
  readonly filter: LibraryFilter;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly searchRef: React.RefObject<HTMLInputElement | null>;
  readonly operationalWorkspaceId?: string;
}) {
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar();
  const sidebarRestoreStarted = useRef(false);
  const [sidebarStateRestored, setSidebarStateRestored] = useState(false);

  useEffect(() => {
    if (sidebarRestoreStarted.current) return;
    sidebarRestoreStarted.current = true;
    const stored = window.localStorage.getItem(DASHBOARD_SIDEBAR_STORAGE_KEY);
    if (stored !== null) setOpen(stored === 'true');
    setSidebarStateRestored(true);
  }, [setOpen]);

  useEffect(() => {
    if (sidebarStateRestored) {
      window.localStorage.setItem(DASHBOARD_SIDEBAR_STORAGE_KEY, String(open));
    }
  }, [open, sidebarStateRestored]);

  const focusSearch = useCallback(() => {
    if (isMobile) setOpenMobile(true);
    else setOpen(true);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [isMobile, searchRef, setOpen, setOpenMobile]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [focusSearch]);

  return (
    <Sidebar className="dashboard-sidebar">
      <Sidebar.Header className="dashboard-sidebar-header">
        <Link
          className="dashboard-brandmark"
          href="/"
          aria-label="Attune home"
          onClick={(e) => {
            if (!open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <AttuneBrandmark size={24} />
        </Link>
        <Sidebar.Trigger className="dashboard-sidebar-header-trigger" />
      </Sidebar.Header>
      <Sidebar.Content>
        {open || isMobile ? (
          <div className="dashboard-search-wrap">
            <InputGroup size="base" className="dashboard-search">
              <InputGroup.Addon>
                <AppIcons.Search size={16} weight="regular" aria-hidden />
              </InputGroup.Addon>
              <InputGroup.Input
                ref={searchRef}
                id="dashboard-project-search"
                type="search"
                value={query}
                placeholder="Search projects"
                onChange={(event) => onQueryChange(event.target.value)}
                aria-label="Search projects"
              />
              <InputGroup.Addon align="end">
                <InputGroup.Button
                  type="button"
                  variant="ghost"
                  tooltip="Focus project search"
                  onClick={focusSearch}
                  aria-label="Focus project search"
                >
                  <kbd>⌘K</kbd>
                </InputGroup.Button>
              </InputGroup.Addon>
            </InputGroup>
          </div>
        ) : (
          <div className="dashboard-search-collapsed">
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={AppIcons.Search}
                tooltip="Search"
                onClick={focusSearch}
                aria-label="Search projects"
              />
            </Sidebar.Menu>
          </div>
        )}
        <Sidebar.Group>
          <Sidebar.Menu>
            {navigation.map((item) => (
              <Sidebar.MenuButton
                key={item.id}
                itemId={`dashboard-${item.id}`}
                href={`/dashboard?view=${item.id}`}
                active={filter === item.id}
                tooltip={item.label}
                size="base"
                icon={
                  item.id === 'recents'
                    ? AppIcons.History
                    : item.id === 'drafts'
                      ? AppIcons.File
                      : AppIcons.Collaborators
                }
              >
                {item.label}
              </Sidebar.MenuButton>
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
        {operationalWorkspaceId ? (
          <Sidebar.Group>
            <Sidebar.GroupLabel>Manufacturing</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                itemId="dashboard-orders"
                href={`/workspace/${encodeURIComponent(operationalWorkspaceId)}?perspective=buyer&surface=buyer_orders`}
                tooltip="Orders"
                size="base"
                icon={AppIcons.Commerce}
              >
                Orders
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                itemId="dashboard-requests"
                href={`/workspace/${encodeURIComponent(operationalWorkspaceId)}?perspective=provider&surface=provider_requests`}
                tooltip="Requests"
                size="base"
                icon={AppIcons.Activity}
              >
                Requests
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                itemId="dashboard-provider-profile"
                href={`/workspace/${encodeURIComponent(operationalWorkspaceId)}?perspective=provider&surface=provider_profile`}
                tooltip="Maker profile"
                size="base"
                icon={AppIcons.Settings}
              >
                Maker profile
              </Sidebar.MenuButton>
              <Sidebar.MenuButton
                itemId="dashboard-notifications"
                tooltip="Notifications"
                size="base"
                icon={AppIcons.Comments}
                onClick={() => window.dispatchEvent(new Event('attune:open-notifications'))}
              >
                Notifications
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
        ) : null}
        <Sidebar.Group>
          <Sidebar.GroupLabel>Account</Sidebar.GroupLabel>
          <Sidebar.Menu>
            <Sidebar.MenuButton
              itemId="dashboard-settings"
              href="/settings"
              tooltip="Settings"
              size="base"
              icon={AppIcons.Settings}
            >
              Settings
            </Sidebar.MenuButton>
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>
    </Sidebar>
  );
}

export function DashboardLibrary({
  files,
  collaboration,
  user,
  filter,
  canCreate,
  headerAction,
  operationalWorkspaceId,
}: {
  readonly files: readonly AttuneLibraryFile[];
  readonly collaboration: boolean;
  readonly user: { readonly id: string; readonly name: string };
  readonly filter: LibraryFilter;
  readonly canCreate: boolean;
  readonly headerAction?: ReactNode;
  readonly operationalWorkspaceId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState(files);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setProjects(files), [files]);

  const visibleFiles = useMemo(
    () => filterLibraryProjects(projects, filter, query),
    [projects, filter, query],
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
    <Sidebar.Provider
      contained
      defaultOpen
      collapsible="icon"
      defaultWidth={DASHBOARD_CHROME.sidebarWidth}
      animationDuration={DASHBOARD_CHROME.motionDuration}
      mobileBreakpoint={720}
      className="dashboard-shell"
      style={dashboardChromeCssVariables}
    >
      <DashboardSidebar
        filter={filter}
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        operationalWorkspaceId={operationalWorkspaceId}
      />
      <section className="dashboard-library" aria-label="Projects">
        <header>
          <div className="dashboard-page-heading">
            <Sidebar.Trigger className="dashboard-mobile-sidebar-trigger" />
            <h1>{activeLabel}</h1>
          </div>
          <div className="flex items-center gap-2">
            {headerAction}
            <NewProjectDialog canCreate={canCreate} />
          </div>
        </header>
        {visibleFiles.length > 0 ? (
          <div className="dashboard-project-grid">
            {visibleFiles.map((project) => (
              <ProjectCard
                key={project.workspaceId}
                project={project}
                collaboration={collaboration}
                user={user}
                onRenamed={(workspaceId, projectName) =>
                  setProjects((current) =>
                    current.map((item) =>
                      item.workspaceId === workspaceId ? { ...item, projectName } : item,
                    ),
                  )
                }
                onDeleted={(workspaceId) =>
                  setProjects((current) =>
                    current.filter((item) => item.workspaceId !== workspaceId),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className="dashboard-empty-viewport">
            <EmptyLibrary
              filter={filter}
              query={query}
              hasProjects={projects.length > 0}
              canCreate={canCreate}
              onCreate={(template) => void createFromEmpty(template)}
            />
          </div>
        )}
      </section>
    </Sidebar.Provider>
  );
}

function LoaderSpinner() {
  return <Loader size={16} className="dashboard-template-loader" />;
}
