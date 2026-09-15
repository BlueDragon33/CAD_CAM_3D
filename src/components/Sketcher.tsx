import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CadProject, SketchConstraint, SketchFeature, SketchPointRef } from '../cad/model';
import {
  applySketchConstraints,
  removeEntityConstraints,
  replaceLineOrientationConstraint,
  upsertEntityDimensionConstraint,
} from '../cad/constraints';
import { analyzeSketchProfiles } from '../cad/profile';
import {
  analyzeSketchEntities,
  createArcEntity,
  createCircleEntity,
  createLineEntity,
  distance2d,
  orthogonalizeLineEnd,
  rectangleProfileAnchors,
  snapSketchPoint,
  type SketchEntity,
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

function translateEntity(entity: SketchEntity, dx: number, dz: number): SketchEntity {
  if (entity.kind === 'line') {
    return {
      ...entity,
      start: { x: entity.start.x + dx, z: entity.start.z + dz },
      end: { x: entity.end.x + dx, z: entity.end.z + dz },
    };
  }
  return { ...entity, center: { x: entity.center.x + dx, z: entity.center.z + dz } };
}

function dimensionConstraintFor(entity: SketchEntity, constraints: SketchConstraint[]) {
  const kind = entity.kind === 'line' ? 'distance' : 'radius';
  return constraints.find((constraint) => constraint.kind === kind && constraint.entityId === entity.id);
}

function lineOrientation(entityId: string, constraints: SketchConstraint[]) {
  const value = constraints.find((constraint) => (
    (constraint.kind === 'horizontal' || constraint.kind === 'vertical') && constraint.entityId === entityId
  ));
  return value?.kind === 'horizontal' || value?.kind === 'vertical' ? value.kind : null;
}

export function Sketcher({ project, feature, onChange, onMessage }: Props) {
  const [tool, setTool] = useState<SketchTool>('select');
  const [pending, setPending] = useState<SketchSnapResult[]>([]);
  const [hover, setHover] = useState<SketchSnapResult | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ entityId: string; last: SketchPoint2D; moved: boolean } | null>(null);

  const entities = feature.params.entities;
  const analysis = useMemo(() => analyzeSketchEntities(entities), [entities]);
  const profileAnalysis = useMemo(() => analyzeSketchProfiles(entities), [entities]);
  const profileEntityIds = useMemo(
    () => new Set(profileAnalysis.primaryCandidate?.entityIds ?? []),
    [profileAnalysis],
  );
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedDimension = selectedEntity ? dimensionConstraintFor(selectedEntity, feature.params.constraints) : undefined;
  const selectedOrientation = selectedEntity?.kind === 'line' ? lineOrientation(selectedEntity.id, feature.params.constraints) : null;
  const viewWidth = Math.max(90, project.dimensions.width * 1.55);
  const viewHeight = Math.max(70, project.dimensions.depth * 1.7);
  const minX = -viewWidth / 2;
  const minZ = -viewHeight / 2;
  const profileAnchors = useMemo(
    () => rectangleProfileAnchors(project.dimensions.width, project.dimensions.depth),
    [project.dimensions.width, project.dimensions.depth],
  );

  const rawPoint = (clientX: number, clientY: number): SketchPoint2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: minX + ((clientX - rect.left) / Math.max(rect.width, 1)) * viewWidth,
      z: minZ + ((clientY - rect.top) / Math.max(rect.height, 1)) * viewHeight,
    };
  };

  const pointerPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const raw = rawPoint(event.clientX, event.clientY);
    return snapSketchPoint(raw, entities, profileAnchors, {
      gridMm: 1,
      toleranceMm: Math.max(0.7, Math.min(viewWidth, viewHeight) / 90),
    });
  };

  const applyFeatureUpdate = (nextEntities: SketchFeature['params']['entities'], nextConstraints: SketchConstraint[], message?: string) => {
    const solvedEntities = applySketchConstraints(nextEntities, nextConstraints);
    onChange({ ...feature, params: { ...feature.params, entities: solvedEntities, constraints: nextConstraints } });
    if (message) onMessage?.(message);
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
    setSelectedEntityId(entity.id);
  };

  const addCircle = (center: SketchSnapResult, rim: SketchSnapResult) => {
    const radiusMm = distance2d(center.point, rim.point);
    if (radiusMm < 0.2) {
      onMessage?.('Circle ignored because its radius is too small.');
      return;
    }
    const entity = createCircleEntity(center.point, radiusMm, true);
    let constraints: SketchConstraint[] = [
      ...feature.params.constraints,
      { id: crypto.randomUUID(), kind: 'radius', entityId: entity.id, valueMm: radiusMm },
    ];
    if (center.anchor?.ref) constraints = [...constraints, { id: crypto.randomUUID(), kind: 'coincident', first: pointRef(entity.id, 'center'), second: center.anchor.ref }];
    applyFeatureUpdate([...entities, entity], constraints, `Construction circle added · R${radiusMm.toFixed(2)} mm.`);
    setSelectedEntityId(entity.id);
  };

  const addArc = (center: SketchSnapResult, start: SketchSnapResult, end: SketchSnapResult) => {
    const radiusMm = distance2d(center.point, start.point);
    if (radiusMm < 0.2) {
      onMessage?.('Arc ignored because its radius is too small.');
      return;
    }
    const entity = createArcEntity(center.point, radiusMm, angleDeg(center.point, start.point), angleDeg(center.point, end.point), true);
    let constraints: SketchConstraint[] = [
      ...feature.params.constraints,
      { id: crypto.randomUUID(), kind: 'radius', entityId: entity.id, valueMm: radiusMm },
    ];
    if (center.anchor?.ref) constraints = [...constraints, { id: crypto.randomUUID(), kind: 'coincident', first: pointRef(entity.id, 'center'), second: center.anchor.ref }];
    applyFeatureUpdate([...entities, entity], constraints, `Construction arc added · R${radiusMm.toFixed(2)} mm.`);
    setSelectedEntityId(entity.id);
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === 'select') {
      setSelectedEntityId(null);
      return;
    }
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

  const handleEntityPointerDown = (event: ReactPointerEvent<SVGElement>, entityId: string) => {
    if (tool !== 'select') return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedEntityId(entityId);
    dragRef.current = { entityId, last: rawPoint(event.clientX, event.clientY), moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool !== 'select') {
      setHover(pointerPoint(event));
      return;
    }
    setHover(null);
    const drag = dragRef.current;
    if (!drag) return;
    const current = rawPoint(event.clientX, event.clientY);
    const dx = current.x - drag.last.x;
    const dz = current.z - drag.last.z;
    if (Math.hypot(dx, dz) <= 1e-9) return;
    const movedEntities = entities.map((entity) => entity.id === drag.entityId ? translateEntity(entity, dx, dz) : entity);
    applyFeatureUpdate(movedEntities, feature.params.constraints);
    dragRef.current = { ...drag, last: current, moved: true };
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) onMessage?.('Sketch entity moved. Persisted constraints were re-applied deterministically.');
  };

  const chooseTool = (next: SketchTool) => {
    setTool(next);
    setPending([]);
    setHover(null);
    dragRef.current = null;
  };

  const clearConstruction = () => {
    const baseConstraints = feature.params.constraints.filter((constraint) => constraint.kind === 'centered' || constraint.kind === 'width' || constraint.kind === 'depth');
    applyFeatureUpdate([], baseConstraints, 'Construction sketch geometry cleared. The parametric rectangle profile is unchanged.');
    setPending([]);
    setSelectedEntityId(null);
  };

  const setSelectedDimension = (value: number) => {
    if (!selectedEntity || !Number.isFinite(value) || value < 0.1) return;
    const kind = selectedEntity.kind === 'line' ? 'distance' : 'radius';
    const constraints = upsertEntityDimensionConstraint(feature.params.constraints, selectedEntity.id, kind, value);
    applyFeatureUpdate(entities, constraints, `${selectedEntity.kind} dimension set to ${value.toFixed(2)} mm.`);
  };

  const freeSelectedDimension = () => {
    if (!selectedEntity) return;
    const kind = selectedEntity.kind === 'line' ? 'distance' : 'radius';
    const constraints = feature.params.constraints.filter((constraint) => !(
      constraint.kind === kind && constraint.entityId === selectedEntity.id
    ));
    applyFeatureUpdate(entities, constraints, `${selectedEntity.kind} dimensional constraint removed.`);
  };

  const setSelectedOrientation = (kind: 'horizontal' | 'vertical' | null) => {
    if (!selectedEntity || selectedEntity.kind !== 'line') return;
    const constraints = replaceLineOrientationConstraint(feature.params.constraints, selectedEntity.id, kind);
    applyFeatureUpdate(entities, constraints, kind ? `Line constrained ${kind}.` : 'Line orientation constraint removed.');
  };

  const deleteSelected = () => {
    if (!selectedEntity) return;
    const nextEntities = entities.filter((entity) => entity.id !== selectedEntity.id);
    const nextConstraints = removeEntityConstraints(feature.params.constraints, selectedEntity.id);
    applyFeatureUpdate(nextEntities, nextConstraints, `${selectedEntity.kind} deleted with dependent constraints.`);
    setSelectedEntityId(null);
  };

  const gridStep = 10;
  const gridXs: number[] = [];
  const gridZs: number[] = [];
  for (let x = Math.ceil(minX / gridStep) * gridStep; x <= minX + viewWidth; x += gridStep) gridXs.push(x);
  for (let z = Math.ceil(minZ / gridStep) * gridStep; z <= minZ + viewHeight; z += gridStep) gridZs.push(z);

  const measuredDimension = selectedEntity
    ? selectedEntity.kind === 'line'
      ? distance2d(selectedEntity.start, selectedEntity.end)
      : selectedEntity.radiusMm
    : 0;

  const candidate = profileAnalysis.primaryCandidate;
  const profileSummary = profileAnalysis.promotable && candidate
    ? `Closed ${candidate.kind} ready · area ${candidate.areaMm2.toFixed(2)} mm² · perimeter ${candidate.perimeterMm.toFixed(2)} mm${candidate.winding === 'not-applicable' ? '' : ` · ${candidate.winding}`}`
    : profileAnalysis.issues[0] ?? 'Draw one simple closed line loop or one circle to create a profile candidate.';

  return (
    <div className="sketcher-shell">
      <div className="sketcher-toolbar" aria-label="Sketch construction tools">
        {(['select', 'line', 'circle', 'arc'] as SketchTool[]).map((entry) => (
          <button key={entry} type="button" data-active={tool === entry} onClick={() => chooseTool(entry)}>{entry}</button>
        ))}
        <button type="button" onClick={clearConstruction} disabled={entities.length === 0}>Clear construction</button>
      </div>

      {selectedEntity ? <div className="sketch-entity-inspector">
        <div>
          <strong>{selectedEntity.kind}</strong>
          <small>{selectedEntity.id.slice(0, 8)} · construction geometry</small>
        </div>
        <label>
          <span>{selectedEntity.kind === 'line' ? 'Length' : 'Radius'}</span>
          <div><input type="number" min="0.1" step="0.1" value={Number(measuredDimension.toFixed(3))} onChange={(event) => setSelectedDimension(Number(event.target.value))} /><b>mm</b></div>
        </label>
        <small>{selectedDimension ? 'Dimensional constraint active' : 'Measured value · edit to constrain'}</small>
        {selectedEntity.kind === 'line' ? <div className="sketch-constraint-actions">
          <button type="button" data-active={selectedOrientation === 'horizontal'} onClick={() => setSelectedOrientation(selectedOrientation === 'horizontal' ? null : 'horizontal')}>Horizontal</button>
          <button type="button" data-active={selectedOrientation === 'vertical'} onClick={() => setSelectedOrientation(selectedOrientation === 'vertical' ? null : 'vertical')}>Vertical</button>
        </div> : null}
        <div className="sketch-constraint-actions">
          <button type="button" onClick={freeSelectedDimension} disabled={!selectedDimension}>Free dimension</button>
          <button type="button" className="danger" onClick={deleteSelected}>Delete</button>
        </div>
      </div> : null}

      <svg
        ref={svgRef}
        className="sketcher-canvas"
        viewBox={`${minX} ${minZ} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(event) => {
          if (tool !== 'select') setHover(null);
          if (dragRef.current && event.buttons === 0) handlePointerUp();
        }}
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
            const classes = ['sketch-entity'];
            if (entity.id === selectedEntityId) classes.push('is-selected');
            if (profileAnalysis.promotable && profileEntityIds.has(entity.id)) classes.push('is-profile-candidate');
            const className = classes.join(' ');
            if (entity.kind === 'line') return <line className={className} key={entity.id} x1={entity.start.x} y1={entity.start.z} x2={entity.end.x} y2={entity.end.z} onPointerDown={(event) => handleEntityPointerDown(event, entity.id)} />;
            if (entity.kind === 'circle') return <circle className={className} key={entity.id} cx={entity.center.x} cy={entity.center.z} r={entity.radiusMm} onPointerDown={(event) => handleEntityPointerDown(event, entity.id)} />;
            return <path className={className} key={entity.id} d={arcPath(entity.center, entity.radiusMm, entity.startAngleDeg, entity.endAngleDeg)} onPointerDown={(event) => handleEntityPointerDown(event, entity.id)} />;
          })}
        </g>

        {selectedEntity?.kind === 'line' ? <g className="sketch-selection-handles">
          <circle cx={selectedEntity.start.x} cy={selectedEntity.start.z} r={Math.max(0.8, Math.min(viewWidth, viewHeight) / 105)} />
          <circle cx={selectedEntity.end.x} cy={selectedEntity.end.z} r={Math.max(0.8, Math.min(viewWidth, viewHeight) / 105)} />
        </g> : selectedEntity ? <circle className="sketch-selection-center" cx={selectedEntity.center.x} cy={selectedEntity.center.z} r={Math.max(0.8, Math.min(viewWidth, viewHeight) / 105)} /> : null}

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
        <span>Manufacturing profile: centered rectangle {project.dimensions.width} × {project.dimensions.depth} mm</span>
        <span>Construction: {analysis.lineCount} line · {analysis.circleCount} circle · {analysis.arcCount} arc · ~{analysis.estimatedDegreesOfFreedom} raw DOF</span>
        <span className="sketch-profile-readiness" data-ready={profileAnalysis.promotable}>
          Candidate profile: {profileAnalysis.promotable ? 'VALID' : 'NOT READY'} · {profileSummary}
        </span>
        <small>{tool === 'select'
          ? selectedEntity ? 'Selected entity · drag to move · edit dimensions/constraints in the entity panel.' : 'Select an entity to drag, dimension, constrain or delete it.'
          : `${tool} tool · grid/anchor snapping active · ${pending.length} point(s) captured`}</small>
        {profileAnalysis.promotable ? <small>Validation only: this closed loop does not replace the manufacturing rectangle until both geometry kernels support profile promotion.</small> : null}
      </div>
    </div>
  );
}
