'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Tooltip } from '@cloudflare/kumo/components/tooltip';
import { useThreads, useUpdateMyPresence } from '@liveblocks/react';
import { Cursors } from '@liveblocks/react-ui';

import type { AttuneApiView } from '../lib/attune-view';
import { AppIcons } from './ui/app-icons';

type PresencePatch = {
  readonly cursor?: { readonly x: number; readonly y: number } | null;
  readonly selection?: string[];
  readonly currentTool?: string;
};

interface RevisionContext {
  readonly revisionId: string;
  readonly specHash: string;
}

function DraftingIcon({ name }: { readonly name: 'select' | 'slot' | 'constraint' | 'measure' }) {
  if (name === 'slot') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="8" width="16" height="8" rx="4" />
      </svg>
    );
  }
  if (name === 'constraint') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="12" r="3" />
        <circle cx="17" cy="12" r="3" />
        <path d="M10 12h4M12 8v8" />
      </svg>
    );
  }
  if (name === 'measure') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17 17 4l3 3L7 20zM10 11l3 3M13 8l3 3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 3 12 9-6.4 1.2L9 20z" />
    </svg>
  );
}

function GeometryDrawing({
  view,
  selectedEntity,
  onSelect,
  onCompare,
  onAskAgent,
  updatePresence,
  showCursors,
  commentsMode,
  commentPins,
}: {
  readonly view: AttuneApiView;
  readonly selectedEntity: string;
  readonly onSelect: (entityId: string) => void;
  readonly onCompare: () => void;
  readonly onAskAgent: () => void;
  readonly updatePresence?: (patch: PresencePatch) => void;
  readonly showCursors: boolean;
  readonly commentsMode: boolean;
  readonly commentPins?: React.ReactNode;
}) {
  const geometry = view.workspace.geometry;
  const scale = 1.25;
  const offsetX = 96;
  const offsetY = 48;
  const slotX = offsetX + (geometry.slot.center.x - geometry.slot.width / 2) * scale;
  const slotY = offsetY + (geometry.slot.center.y - geometry.slot.height / 2) * scale;
  const conflict = !view.validation.valid;

  const select = (entityId: string) => {
    onSelect(entityId);
    updatePresence?.({ selection: [entityId], currentTool: 'select' });
  };

  return (
    <section
      className="attune-canvas absolute inset-0 z-0"
      aria-label="AT-1042 temporary semantic geometry canvas"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        updatePresence?.({
          cursor: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        });
      }}
      onPointerLeave={() => updatePresence?.({ cursor: null })}
    >
      <div className="pointer-events-none absolute top-[132px] right-3 left-3 z-20 flex items-center justify-between gap-3 text-xs text-kumo-subtle transition-[left,right] duration-100 lg:right-[344px] lg:left-[272px] lg:group-data-[left-collapsed=true]/workspace:left-3 lg:group-data-[right-collapsed=true]/workspace:right-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border bg-kumo-base/95 px-3 py-1.5 font-semibold shadow-sm backdrop-blur ${conflict ? 'border-attune-conflict/30 text-attune-conflict' : 'border-attune-valid/30 text-attune-valid'}`}
        >
          <i className="size-2 rounded-full bg-current" />{' '}
          {conflict ? 'Manufacturing conflict' : 'Buildable specification'}
        </span>
        <span className="rounded-full border border-kumo-line bg-kumo-base/95 px-3 py-1.5 shadow-sm backdrop-blur">
          Top view · millimetres
        </span>
      </div>
      <output className="pointer-events-none absolute top-[174px] left-1/2 z-20 hidden max-w-xl -translate-x-1/2 items-center gap-2 rounded-lg border border-kumo-line bg-kumo-base/95 px-3 py-2 text-xs text-kumo-subtle shadow-sm backdrop-blur md:flex">
        <AppIcons.Select size={16} weight="bold" />
        <span>
          {commentsMode
            ? 'Comments mode: select a pin to reveal its referenced geometry.'
            : selectedEntity === 'slot:connector'
              ? 'Connector slot selected: compare provider-valid clearance repairs.'
              : 'Select a feature to inspect its manufacturing properties and constraints.'}
        </span>
      </output>
      <div
        className="absolute top-1/2 left-3 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-kumo-line bg-kumo-base/95 p-1.5 shadow-md backdrop-blur transition-[left] duration-100 lg:left-[272px] lg:group-data-[left-collapsed=true]/workspace:left-3"
        aria-label="Workspace tools"
      >
        <Tooltip
          content="Select features"
          render={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              shape="square"
              icon={<DraftingIcon name="select" />}
              aria-label="Select features"
            />
          }
        />
        <Tooltip
          content="Select connector slot"
          render={
            <Button
              type="button"
              variant={selectedEntity === 'slot:connector' ? 'secondary' : 'ghost'}
              size="sm"
              shape="square"
              icon={<DraftingIcon name="slot" />}
              aria-label="Select connector slot"
              onClick={() => select('slot:connector')}
            />
          }
        />
        <span className="mx-1 my-0.5 h-px bg-kumo-line" />
        <Tooltip
          content="Inspect constraints"
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              shape="square"
              icon={<DraftingIcon name="constraint" />}
              aria-label="Inspect constraints"
              onClick={() => select('constraint:slot-clearance')}
            />
          }
        />
        <Tooltip
          content="Inspect measurements"
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              shape="square"
              icon={<DraftingIcon name="measure" />}
              aria-label="Inspect measurements"
            />
          }
        />
      </div>
      <div className="canvas-viewport">
        {showCursors ? (
          <div className="attune-liveblocks-bridge pointer-events-none absolute inset-0 z-20">
            <Cursors />
          </div>
        ) : null}
        {commentPins}
        <svg viewBox="0 0 720 440" aria-labelledby="attune-geometry-title attune-geometry-desc">
          <title id="attune-geometry-title">AT-1042 custom control-enclosure faceplate</title>
          <desc id="attune-geometry-desc">
            A 420 by 280 by 3 millimetre aluminium control-enclosure faceplate with a display,
            cooling fan, cable glands, vents and connector opening. Four buyer installation mounts
            are locked. The connector slot has {view.validation.evidence.slotRightClearanceMm}{' '}
            millimetres clearance where {view.validation.evidence.requiredSlotClearanceMm} is
            required by the selected provider.
          </desc>
          <defs>
            <pattern id="attune-grid-small" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M12 0H0V12" />
            </pattern>
            <pattern id="attune-grid-major" width="60" height="60" patternUnits="userSpaceOnUse">
              <rect width="60" height="60" fill="url(#attune-grid-small)" />
              <path d="M60 0H0V60" />
            </pattern>
          </defs>
          <rect className="canvas-grid" width="720" height="440" />
          <g className="geometry-origin" transform={`translate(${offsetX} ${offsetY})`}>
            <rect
              className={selectedEntity === 'panel' ? 'attune-panel is-selected' : 'attune-panel'}
              width={geometry.width * scale}
              height={geometry.height * scale}
              rx="5"
              onPointerDown={() => select('panel')}
            />
            {[...geometry.mounts, ...geometry.auxiliaryHoles].map((hole) => {
              const selected = selectedEntity === hole.id;
              return (
                <g
                  className={selected ? 'geometry-feature is-selected' : 'geometry-feature'}
                  key={hole.id}
                  onPointerDown={() => select(hole.id)}
                >
                  <circle
                    className={hole.locked ? 'attune-hole is-locked' : 'attune-hole'}
                    cx={hole.center.x * scale}
                    cy={hole.center.y * scale}
                    r={(hole.diameter * scale) / 2}
                  />
                  {hole.locked ? (
                    <g
                      className="geometry-lock"
                      transform={`translate(${hole.center.x * scale - 5} ${hole.center.y * scale - 23})`}
                    >
                      <path d="M2 8V5a3 3 0 0 1 6 0v3" />
                      <rect x="0" y="8" width="10" height="8" rx="2" />
                    </g>
                  ) : null}
                </g>
              );
            })}
            {geometry.circularCutouts.map((cutout) => (
              <circle
                className={
                  selectedEntity === cutout.id ? 'attune-cutout is-selected' : 'attune-cutout'
                }
                key={cutout.id}
                cx={cutout.center.x * scale}
                cy={cutout.center.y * scale}
                r={(cutout.diameter * scale) / 2}
                onPointerDown={() => select(cutout.id)}
              />
            ))}
            {geometry.rectangularCutouts.map((cutout) => (
              <rect
                className={
                  selectedEntity === cutout.id ? 'attune-cutout is-selected' : 'attune-cutout'
                }
                key={cutout.id}
                x={(cutout.center.x - cutout.width / 2) * scale}
                y={(cutout.center.y - cutout.height / 2) * scale}
                width={cutout.width * scale}
                height={cutout.height * scale}
                rx={cutout.cornerRadius * scale}
                onPointerDown={() => select(cutout.id)}
              />
            ))}
            {geometry.ventSlots.map((vent) => (
              <rect
                className={
                  selectedEntity === vent.id ? 'attune-cutout is-selected' : 'attune-cutout'
                }
                key={vent.id}
                x={(vent.center.x - vent.width / 2) * scale}
                y={(vent.center.y - vent.height / 2) * scale}
                width={vent.width * scale}
                height={vent.height * scale}
                rx={(vent.height * scale) / 2}
                onPointerDown={() => select(vent.id)}
              />
            ))}
            <rect
              className={[
                'attune-slot',
                conflict ? 'is-conflict' : 'is-valid',
                selectedEntity === 'slot:connector' ||
                selectedEntity === 'constraint:slot-clearance'
                  ? 'is-selected'
                  : '',
              ].join(' ')}
              x={(geometry.slot.center.x - geometry.slot.width / 2) * scale}
              y={(geometry.slot.center.y - geometry.slot.height / 2) * scale}
              width={geometry.slot.width * scale}
              height={geometry.slot.height * scale}
              rx={geometry.slot.height * scale * 0.48}
              onPointerDown={() => select('slot:connector')}
            />
          </g>
          <g className="canvas-dimensions">
            <path
              d={`M${offsetX} ${offsetY - 22}v12M${offsetX} ${offsetY - 16}h${geometry.width * scale}M${offsetX + geometry.width * scale} ${offsetY - 22}v12`}
            />
            <text x={offsetX + (geometry.width * scale) / 2} y={offsetY - 24} textAnchor="middle">
              {geometry.width} mm
            </text>
            <path
              d={`M${offsetX - 22} ${offsetY}h12M${offsetX - 16} ${offsetY}v${geometry.height * scale}M${offsetX - 22} ${offsetY + geometry.height * scale}h12`}
            />
            <text
              x={offsetX - 32}
              y={offsetY + (geometry.height * scale) / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${offsetX - 32} ${offsetY + (geometry.height * scale) / 2})`}
            >
              {geometry.height} mm
            </text>
            <path
              className={
                conflict ? 'clearance-dimension is-conflict' : 'clearance-dimension is-valid'
              }
              d={`M${slotX + geometry.slot.width * scale} ${slotY - 10}v-10M${slotX + geometry.slot.width * scale} ${slotY - 15}H${offsetX + geometry.width * scale}M${offsetX + geometry.width * scale} ${slotY - 10}v-10`}
            />
          </g>
        </svg>
        <div
          className={`absolute right-3 bottom-16 z-20 w-[min(320px,calc(100%-24px))] rounded-xl border bg-kumo-base/95 p-4 shadow-lg backdrop-blur transition-[right] duration-100 lg:right-[344px] lg:group-data-[right-collapsed=true]/workspace:right-3 ${conflict ? 'border-attune-conflict/35' : 'border-attune-valid/35'}`}
        >
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider ${conflict ? 'text-attune-conflict' : 'text-attune-valid'}`}
          >
            {conflict ? 'Clearance conflict' : 'Clearance verified'}
          </span>
          <strong className="mt-1 block text-lg font-semibold">
            {view.validation.evidence.slotRightClearanceMm} mm <i>/</i>{' '}
            {view.validation.evidence.requiredSlotClearanceMm} mm required
          </strong>
          <small className="mt-1 block text-xs text-kumo-subtle">
            4 / 4 buyer mounts protected
          </small>
          {conflict ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="primary" size="sm" onClick={onCompare}>
                Compare valid changes
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onAskAgent}>
                Ask agent
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-attune-valid">Request quote available</p>
          )}
        </div>
        <div className="canvas-axis" aria-hidden="true">
          <span className="axis-x">X</span>
          <span className="axis-y">Y</span>
        </div>
      </div>
    </section>
  );
}

function SpatialCommentPins({
  view,
  revisionContext,
  onSelect,
}: {
  readonly view: AttuneApiView;
  readonly revisionContext: RevisionContext;
  readonly onSelect: (entityId: string) => void;
}) {
  const result = useThreads({ query: { metadata: { workspaceId: view.product.workspaceId } } });
  return (
    <div className="canvas-comment-pins" aria-label="Spatial comment pins">
      {(result.threads ?? []).map((thread, index) => {
        const current = thread.metadata.specHash === revisionContext.specHash;
        return (
          <Button
            type="button"
            variant={current ? 'primary' : 'secondary'}
            size="xs"
            shape="circle"
            className={current ? 'canvas-comment-pin' : 'canvas-comment-pin is-historic'}
            style={{
              left: `${Math.max(3, Math.min(97, (thread.metadata.x / 720) * 100))}%`,
              top: `${Math.max(5, Math.min(95, (thread.metadata.y / 440) * 100))}%`,
            }}
            icon={<AppIcons.Comments size={16} weight="fill" />}
            aria-label={`Comment ${index + 1} on ${thread.metadata.entityId}`}
            title={`${thread.metadata.entityId} · ${thread.metadata.revisionId}`}
            key={thread.id}
            onClick={() => onSelect(thread.metadata.entityId)}
          />
        );
      })}
    </div>
  );
}

function CollaborativeCanvas(
  props: Omit<
    React.ComponentProps<typeof GeometryDrawing>,
    'updatePresence' | 'showCursors' | 'commentPins'
  > & {
    readonly revisionContext: RevisionContext;
  },
) {
  const updatePresence = useUpdateMyPresence();
  const { revisionContext, ...drawingProps } = props;
  return (
    <GeometryDrawing
      {...drawingProps}
      updatePresence={updatePresence}
      showCursors
      commentPins={
        props.commentsMode ? (
          <SpatialCommentPins
            view={props.view}
            revisionContext={revisionContext}
            onSelect={props.onSelect}
          />
        ) : null
      }
    />
  );
}

export function WorkspaceCanvas({
  collaboration,
  revisionContext,
  ...props
}: Omit<React.ComponentProps<typeof GeometryDrawing>, 'updatePresence' | 'showCursors'> & {
  readonly collaboration: boolean;
  readonly revisionContext: RevisionContext;
}) {
  return collaboration ? (
    <CollaborativeCanvas {...props} revisionContext={revisionContext} />
  ) : (
    <GeometryDrawing {...props} showCursors={false} />
  );
}
