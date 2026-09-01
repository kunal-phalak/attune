'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { Tooltip } from '@cloudflare/kumo/components/tooltip';

import { AppIcons } from './ui/app-icons';

export function WorkspaceOrientationHud({
  right,
  gridStep,
  zoom,
  onFit,
  onReset,
}: {
  readonly right: number;
  readonly gridStep: number;
  readonly zoom: number;
  readonly onFit: () => void;
  readonly onReset: () => void;
}) {
  return (
    <Popover>
      <Tooltip
        content="Sketch plane · XY"
        render={
          <Popover.Trigger
            render={
              <Button
                type="button"
                variant="secondary"
                className="sketch-orientation-hud"
                style={{ right: `${right}px` }}
                aria-label="Sketch plane · XY"
              >
                <span className="sketch-orientation-gizmo" aria-hidden>
                  <span className="sketch-axis is-y">Y</span>
                  <span className="sketch-plane-face">XY</span>
                  <span className="sketch-axis-origin" />
                  <span className="sketch-axis is-x">X</span>
                </span>
                <span className="sketch-orientation-copy">
                  <strong>Top</strong>
                  <small>{gridStep} mm</small>
                </span>
              </Button>
            }
          />
        }
      />
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        positionMethod="fixed"
        className="sketch-orientation-popover"
      >
        <Popover.Title>View</Popover.Title>
        <Popover.Description>Sketch plane · XY</Popover.Description>
        <dl className="sketch-view-metrics">
          <div>
            <dt>Orientation</dt>
            <dd>Top</dd>
          </div>
          <div>
            <dt>Grid</dt>
            <dd>{gridStep} mm</dd>
          </div>
          <div>
            <dt>Zoom</dt>
            <dd>{Math.round(zoom * 100)}%</dd>
          </div>
        </dl>
        <div className="sketch-view-actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<AppIcons.View />}
            onClick={onFit}
          >
            Fit sketch
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<AppIcons.Reset />}
            onClick={onReset}
          >
            Reset view
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  );
}
