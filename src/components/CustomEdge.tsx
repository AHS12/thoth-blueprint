import { colors, DbRelationship, DbRelationShipLabel } from "@/lib/constants";
import { type EdgeData } from "@/lib/types";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  useReactFlow,
} from "@xyflow/react";
import { useMemo, useCallback } from "react";
import React from "react";

const EdgeIndicator = ({
  x,
  y,
  label,
  isHighlighted = false,
}: {
  x: number;
  y: number;
  label: string;
  isHighlighted?: boolean;
}) => (
  <div
    style={{
      position: "absolute",
      transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
      background: isHighlighted ? colors.HIGHLIGHT : colors.DEFAULT_INDICATOR,
      color: "white",
      fontSize: "10px",
      fontWeight: "bold",
      width: "18px",
      height: "18px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      borderRadius: "50%",
      zIndex: 1,
      lineHeight: "1",
      paddingBottom: "1px",
      transition: "background-color 0.2s ease-in-out",
    }}
    className="nodrag nopan"
  >
    {label}
  </div>
);

const getPointAlongPath = (pathData: string, distance: number) => {
  if (typeof document === "undefined") return { x: 0, y: 0 };
  const pathNode = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  pathNode.setAttribute("d", pathData);
  return pathNode.getPointAtLength(distance);
};

const getTotalPathLength = (pathData: string) => {
  if (typeof document === "undefined") return 0;
  const pathNode = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );
  pathNode.setAttribute("d", pathData);
  return pathNode.getTotalLength();
};

const EdgeHandle = ({
  x,
  y,
  onMouseDown,
}: {
  x: number;
  y: number;
  onMouseDown: (event: React.MouseEvent) => void;
}) => (
  <div
    style={{
      position: "absolute",
      transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
      background: colors.HIGHLIGHT,
      width: "12px",
      height: "12px",
      borderRadius: "50%",
      cursor: "grab",
      pointerEvents: "all",
      zIndex: 1001,
      border: "2px solid white",
    }}
    onMouseDown={onMouseDown}
    className="nodrag nopan"
  />
);

function CustomEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    style = {},
    selected,
  } = props;

  const { setEdges } = useReactFlow();

  // Type assertion for the data property
  const edgeData = data as EdgeData | undefined;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    ...(edgeData?.centerX !== undefined ? { centerX: edgeData.centerX } : {}),
    ...(edgeData?.centerY !== undefined ? { centerY: edgeData.centerY } : {}),
  });

  const onHandleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      
      const startX = event.clientX;
      const startY = event.clientY;
      const initialCenterX = edgeData?.centerX ?? labelX;
      const initialCenterY = edgeData?.centerY ?? labelY;

      const onPointerMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        setEdges((edges) =>
          edges.map((e) => {
            if (e.id === id) {
              return {
                ...e,
                data: {
                  ...e.data,
                  centerX: initialCenterX + dx,
                  centerY: initialCenterY + dy,
                },
              };
            }
            return e;
          })
        );
      };

      const onPointerUp = () => {
        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);
      };

      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    },
    [edgeData, labelX, labelY, id, setEdges]
  );

  const { isHighlighted, relationship } = edgeData || {};

  const { sourcePoint, targetPoint, handlePoints } = useMemo(() => {
    const pathLength = getTotalPathLength(edgePath);
    const distance = 40;
    const safeDistance = Math.min(distance, pathLength / 2 - 5);

    const sp = getPointAlongPath(edgePath, safeDistance);
    const tp = getPointAlongPath(edgePath, pathLength - safeDistance);

    // Calculate multiple handle points
    const handles = [];
    if (pathLength > 0) {
      // Add points at 25%, 50% (label position), and 75%
      handles.push(getPointAlongPath(edgePath, pathLength * 0.25));
      // Middle point is already labelX/labelY, but we can add it here too if we want uniformity
      // handles.push({ x: labelX, y: labelY }); 
      handles.push(getPointAlongPath(edgePath, pathLength * 0.75));
    }

    return { sourcePoint: sp, targetPoint: tp, handlePoints: handles };
  }, [edgePath]);

  let sourceLabel = "";
  let targetLabel = "";
  switch (relationship) {
    case DbRelationship.ONE_TO_ONE:
      sourceLabel = DbRelationShipLabel.ONE;
      targetLabel = DbRelationShipLabel.ONE;
      break;
    case DbRelationship.ONE_TO_MANY:
      sourceLabel = DbRelationShipLabel.ONE;
      targetLabel = DbRelationShipLabel.MANY;
      break;
    case DbRelationship.MANY_TO_ONE:
      sourceLabel = DbRelationShipLabel.MANY;
      targetLabel = DbRelationShipLabel.ONE;
      break;
    case DbRelationship.MANY_TO_MANY:
      sourceLabel = DbRelationShipLabel.MANY;
      targetLabel = DbRelationShipLabel.MANY;
      break;
    default:
      sourceLabel = DbRelationShipLabel.ONE;
      targetLabel = DbRelationShipLabel.MANY;
      break;
  }

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: isHighlighted ? colors.HIGHLIGHT : colors.DEFAULT_STROKE,
          strokeWidth: isHighlighted ? 2 : 1.5,
          ...style,
        }}
      />
      {isHighlighted && (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: colors.WHITE,
            strokeWidth: 2,
            strokeDasharray: "10, 20",
            animation: "flow 2s linear infinite",
          }}
        />
      )}
      <EdgeLabelRenderer>
        <EdgeIndicator
          x={sourcePoint.x}
          y={sourcePoint.y}
          label={sourceLabel}
          isHighlighted={isHighlighted ?? false}
        />
        <EdgeIndicator
          x={targetPoint.x}
          y={targetPoint.y}
          label={targetLabel}
          isHighlighted={isHighlighted ?? false}
        />
        {selected && (
          <>
            <EdgeHandle x={labelX} y={labelY} onMouseDown={onHandleMouseDown} />
            {handlePoints?.map((point, index) => (
              <EdgeHandle
                key={index}
                x={point.x}
                y={point.y}
                onMouseDown={onHandleMouseDown}
              />
            ))}
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

// Memoized CustomEdge component with comparison function
const MemoizedCustomEdge = React.memo(CustomEdge, (prevProps, nextProps) => {
  // Compare essential props that affect rendering
  return (
    prevProps.id === nextProps.id &&
    prevProps.source === nextProps.source &&
    prevProps.target === nextProps.target &&
    prevProps.sourceX === nextProps.sourceX &&
    prevProps.sourceY === nextProps.sourceY &&
    prevProps.targetX === nextProps.targetX &&
    prevProps.targetY === nextProps.targetY &&
    prevProps.sourcePosition === nextProps.sourcePosition &&
    prevProps.targetPosition === nextProps.targetPosition &&
    prevProps.selected === nextProps.selected &&
    // Compare edge data
    JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data) &&
    // Compare style
    JSON.stringify(prevProps.style) === JSON.stringify(nextProps.style)
  );
});

MemoizedCustomEdge.displayName = 'CustomEdge';

export default MemoizedCustomEdge;
