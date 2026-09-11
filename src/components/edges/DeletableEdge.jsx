// Registered as the 'default' edge type (see FlowCanvas.jsx), so every
// connection — old ones loaded from storage and new ones drawn on the
// canvas — gets a small × at its midpoint. Needed on top of the usual
// "select + press Delete" because touch devices have no Delete key.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from 'reactflow';

export default function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style
}) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="edge-delete nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <button
            className="edge-delete__btn"
            onClick={(e) => {
              e.stopPropagation();
              setEdges((eds) => eds.filter((edge) => edge.id !== id));
            }}
            title="Удалить связь"
            aria-label="Удалить связь"
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
