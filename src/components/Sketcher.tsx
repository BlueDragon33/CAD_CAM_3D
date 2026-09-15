import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CadProject, SketchConstraint, SketchFeature, SketchPointRef } from '../cad/model';
import {
  analyzeSketchEntities,
  createArcEntity,
  createCircleEntity,
  createLineEntity,
  distance2d,
  orthogonalizeLineEnd,
  rectangleProfileAnchors,
  snapSketchPoint,
  type SketchPoint2D,
  type SketchSnapResult,
} from '../cad/sketch';

type SketchTool = 'select' | 'line' | 'circle' | 'arc';

type Props = {
  project: CadProject;
  feature: SketchFeature;
  onChange: (feature: SketchFeature) => void;
  onMessage?: (message: string) => void;
};

function pointRef(entityId: string, point: SketchPointRef['point']): SketchPointRef {
  return { entityId, point };
}

function angleDeg(center: SketchPoint2D, point: SketchPoint2D) {
  return Math.atan2(point.z - center.z, point.x - center.x) * 180 / Math.PI;
}

function arcPath(center: SketchPoint2D, radius: number, startAngleDeg: number, endAngleDeg: number) {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const start = { x: center.x + Math.cos(rad(startAngleDeg)) * radius, z: center.z + Math.sin(rad(startAngleDeg)) * radius };
  const end = { x: center.x + Math.cos(rad(endAngleDeg)) * radius, z: center.z + Math.sin(rad(endAngleDeg)) * radius };
  let sweep = endAngleDeg - startAngleDeg;
  while (sweep < 0) sweep += 360;
  while (sweep >= 360) sweep -= 360;
  const large = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.z} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.z}`;
}

export function Sketcher({ project, feature, onChange, onMessage }: Props) {
  const [tool, setTool] = useState<SketchTool>('select');
  const [pending, setPending] = useState<SketchSnapResult[]>([]);
  const [hover, setHover] = useState<SketchSnapResult | null>(null);

  const entities = feature.params.entities;
  const analysis = useMemo(() => analyzeSketchEntities(entities), [entities]);
  const viewWidth = Math.max(90, project.dimensions.width * 1.55);
  const viewHeight = Math.max(70, project.dimensions.depth * 1.7);
  const minX = -viewWidth / 2;
  const minZ = -viewHeight / 2;
  const profileAnchors = useMemo(
    () => rectangleProfileAnchors(project.dimensions.width, project.dimensions.depth),
    [project.dimensions.width, project.dimensions.depth],
  );

  const pointerPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = {
      x: minX + ((event.clientX - rect.left) / Math.max(rect.width, 1)) * viewWidth,
      z: minZ + ((event.clientY - rect.top) / Math.max(rect.height, 1)) * viewHeight,
    };
    return snapSketchPoint(raw, entities, profileAnchors, { gridMm: 1, toleranceMm: Math.max(0.7, Math.min(viewWidth, viewHeight) / 90) });
  };

  const applyFeatureUpdate = (nextEntities: SketchFeature['params']['entities'], nextConstraints: SketchConstraint[], message: string) => {
    onChange({ ...feature, params: { ...feature.params, entities: nextEntities, constraints: nextConstraints } });
    onMessage?.(message);
  };

  const addLine = (first: SketchSnapResult, second: SketchSnapResult) => {
    const aligned = second.kind === 'anchor' ? { point: second.point, constraint: null } : orthogonalizeLineEnd(first.point, second.point, 1.1);
    if (distance2d(first.point, aligned.point) < 0.2) {
      onMessage?.('Line ignored because its endpoints are too close.');
      return;
    }
    const entity = createLineEntity(first.point, aligned.point, true);
    const constraints: SketchConstraint[] = [...feature.params.constraints];
    if (aligned.constraint) constraints.push({ id: crypto.randomUUID(), kind: aligned.constraint, entityId: entity.id });
    if (first.anchor?.ref) constraints.push({ id: crypto.randomUUID(), kind: 'coincident', first: pointRef(entity.id, 'start'), second: first.anchor.ref });
    if (second.anchor?.ref) constraints.push({ id: crypto.randomUUID(), kind: 'coincident', first: pointRef(entity.id, 'end'), second: second.anchor.ref });
    applyFeatureUpdate([...entities, entity], constraints, `Construction line added${aligned.constraint ? ` · ${aligned.constraint}` : ''}.`);
  };

  const addCircle = (center: SketchSnapResult, rim: SketchSnapResult) => {
    const radiusMm = distance2d(center.point, rim.point);
    if (radiusMm < 0.2) {
      onMessage?.('Circle ignored because its radius is too small.');
      return;
    }
    const entity = createCircleEntity(center.point, radiusMm, true);
    const constraints: SketchConstraint[] = [
      ...feature.params.constraints,
      { id: crypto.randomUUID(), kind: 'radius', entityId: entity.id, valueMm: radiusMm },
    ];
    if (center.anchor?.ref) constraints.push({ id: crypto.randomUUID(), kind: 'coincident', first: pointRef(entity.id, 'center'), second: center.anchor.ref });
    applyFeatureUpdate([...entities, entity], constraints, `Construction circle added · R${radiusMm.toFixed(2)} mm.`);
  };

  const addArc = (center: SketchSnapResult, start: SketchSnapResult, end: SketchSnapResult) => {
    const radiusMm = distance2d(center.point, start.point);
    if (radiusMm < 0.2) {
      onMessage?.('Arc ignored because its radius is too small.');
      return;
    }
    const entity = createArcEntity(center.point, radiusMm, angleDeg(center.point, start.point), angleDeg(center.point, end.point), true);
    const constraints: SketchConstraint[] = [
      ...feature.params.constraints,
      { id: crypto.randomUUID(), kind: 'radius', entityId: entity.id, valueMm: radiusMm },
    ];
    if (center.anchor?.ref) constraints.push({ id: crypto.randomUUID(), kind: 'coincident', first: pointRef(entity.id, 'center'), second: center.anchor.ref });
    applyFeatureUpdate([...entities, entity], constraints, `Construction arc added · R${radiusMm.toFixed(2)} mm.`);
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === 'select') return;
    const point = pointerPoint(event);
    if (tool === 'line') {
      if (pending.length === 0) setPending([point]);
      else {
        addLine(pending[0], point);
        setPending([]);
      }
      return;
    }
    if (tool === 'circle') {
      if (pending.length === 0) setPending([point]);
      else {
        addCircle(pending[0], point);
        setPending([]);
      }
      return;
    }
    if (pending.length < 2) setPending([...pending, point]);
    else {
      addArc(pending[0], pending[1], point);
      setPending([]);
    }
  };

  const chooseTool = (next: SketchTool) => {
    setTool(next);
    setPending([]);
    setHover(null);
  };

  const clearConstruction = () => {
    const baseConstraints = feature.params.constraints.filter((constraint) => constraint.kind === 'centered' || constraint.kind === 'width' || constraint.kind === 'depth');
    applyFeatureUpdate([], baseConstraints, 'Construction sketch geometry cleared. The parametric rectangle profile is unchanged.');
    setPending([]);
  };

  const gridStep = 10;
  const gridXs: number[] = [];
  const gridZs: number[] = [];
  for (let x = Math.ceil(minX / gridStep) * gridStep; x <= minX + viewWidth; x += gridStep) gridXs.push(x);
  for (let z = Math.ceil(minZ / gridStep) * gridStep; z <= minZ + viewHeight; z += gridStep) gridZs.push(z);

  return (
    <div className="sketcher-shell">
      <div className="sketcher-toolbar" aria-label="Sketch construction tools">
        {(['select', 'line', 'circle', 'arc'] as SketchTool[]).map((entry) => (
          <button key={entry} type="button" data-active={tool === entry} onClick={() => chooseTool(entry)}>{entry}</button>
        ))}
        <button type="button" onClick={clearConstruction} disabled={entities.length === 0}>Clear construction</button>
      </div>

      <svg
        className="sketcher-canvas"
        viewBox={`${minX} ${minZ} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => tool === 'select' ? setHover(null) : setHover(pointerPoint(event))}
        onPointerLeave={() => setHover(null)}
        aria-label="XZ sketch workspace"
      >
        <g className="sketch-grid">
          {gridXs.map((x) => <line key={`x-${x}`} x1={x} y1={minZ} x2={x} y2={minZ + viewHeight} />)}
          {gridZs.map((z) => <line key={`z-${z}`} x1={minX} y1={z} x2={minX + viewWidth} y2={z} />)}
          <line className="sketch-axis" x1={minX} y1={0} x2={minX + viewWidth} y2={0} />
          <line className="sketch-axis" x1={0} y1={minZ} x2={0} y2={minZ + viewHeight} />
        </g>

        <rect
          className="sketch-profile"
          x={-project.dimensions.width / 2}
          y={-project.dimensions.depth / 2}
          width={project.dimensions.width}
          height={project.dimensions.depth}
        />

        <g className="sketch-construction">
          {entities.map((entity) => {
            if (entity.kind === 'line') return <line key={entity.id} x1={entity.start.x} y1={entity.start.z} x2={entity.end.x} y2={entity.end.z} />;
            if (entity.kind === 'circle') return <circle key={entity.id} cx={entity.center.x} cy={entity.center.z} r={entity.radiusMm} />;
            return <path key={entity.id} d={arcPath(entity.center, entity.radiusMm, entity.startAngleDeg, entity.endAngleDeg)} />;
          })}
        </g>

        {pending.length > 0 && hover ? <g className="sketch-preview">
          {tool === 'line' ? <line x1={pending[0].point.x} y1={pending[0].point.z} x2={hover.point.x} y2={hover.point.z} /> : null}
          {tool === 'circle' ? <circle cx={pending[0].point.x} cy={pending[0].point.z} r={distance2d(pending[0].point, hover.point)} /> : null}
          {tool === 'arc' && pending.length === 1 ? <line x1={pending[0].point.x} y1={pending[0].point.z} x2={hover.point.x} y2={hover.point.z} /> : null}
          {tool === 'arc' && pending.length === 2 ? <path d={arcPath(pending[0].point, distance2d(pending[0].point, pending[1].point), angleDeg(pending[0].point, pending[1].point), angleDeg(pending[0].point, hover.point))} /> : null}
        </g> : null}

        {hover ? <circle className="sketch-snap-marker" cx={hover.point.x} cy={hover.point.z} r={Math.max(0.7, Math.min(viewWidth, viewHeight) / 120)} data-snap={hover.kind} /> : null}
      </svg>

      <div className="sketcher-status">
        <strong>Sketch · XZ</strong>
        <span>Profile: centered rectangle {project.dimensions.width} × {project.dimensions.depth} mm</span>
        <span>Construction: {analysis.lineCount} line · {analysis.circleCount} circle · {analysis.arcCount} arc</span>
        <small>{tool === 'select' ? 'Choose Line, Circle or Arc to add persisted construction geometry.' : `${tool} tool · grid/anchor snapping active · ${pending.length} point(s) captured`}</small>
      </div>
    </div>
  );
}
