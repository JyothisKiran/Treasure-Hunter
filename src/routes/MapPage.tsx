import { PixiRoadLayer } from "@/components/map-maker/PixiRoadLayer";
import { useGetMapSkeleton } from "@/hooks/queries/useGetMap";
import { useGetVisitedNodes } from "@/hooks/queries/useGetVisitedNodes";
import type { MapSkeletonNode } from "@/types/map";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

type Camera = {
  /** Camera translation in SCREEN coordinates. */
  x: number;
  y: number;
  /** Camera zoom. */
  zoom: number;
};

type RoadPoint = {
  x: number;
  y: number;
};

type RoadDirection = "up" | "right" | "down" | "left";

type EdgeRouting = {
  sourcePortOffset: number;
  targetPortOffset: number;
  laneOffset: number;
};

type ConnectedEdge = {
  source: MapSkeletonNode;
  target: MapSkeletonNode;
  endpoint: "source" | "target";
};

type MapEdge = {
  id: number | string;
  source: number | string;
  target: number | string;
};

type FogNode = { id: string; x: number; y: number; radius: number };
type FogPath = { id: string; points: string; strokeWidth: number };

/**
 * NOTE: this file's component is named `Map`, which shadows the global Map
 * inside this module. ReadonlyMap is not shadowed, so it is used for types.
 */
type NodeById = ReadonlyMap<string, MapSkeletonNode>;

/* -------------------------------------------------------------------------- */
/*                              MAP CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

const NODE_WIDTH = 220;
const NODE_HEIGHT = 132;

const JUNCTION_SIZE = 92;
const ROAD_NODE_OVERLAP = -16;
const BG_TILE_SIZE = 256; // px of the tile at zoom = 1

const ALIGNMENT_EPSILON = 4;
const ROUTING_LANE_GAP = 28;

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

const ZOOM_STEP = 0.1;

const FIT_PADDING = 100;

const CURRENT_NODE_REVEAL_DISTANCE = 576;
const FOG_NODE_REVEAL_RADIUS = 180;
const FOG_PATH_REVEAL_WIDTH = 150;
const FOG_BLUR_RADIUS = 10;

/* Walker (character that walks from the previous node to the current node) */
const WALKER_SIZE = 48; // displayed size in world px (sprite frame is 64px)
const WALKER_FOOT_Y = 42; // px from sprite top to its boots
const WALKER_SPEED = 240; // world px per second
const WALKER_FPS = 9; // leg animation frames per second
const WALKER_FRAMES = 4; // frames per row in walker.png

const ROAD_GRID = 16; // must match MAP_GRID_SIZE in PixiRoadLayer
const ROAD_CENTER = ROAD_GRID / 2;

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getNodeDimensions(node: MapSkeletonNode) {
  if (node.effects === "JUNCTION") {
    return { width: JUNCTION_SIZE, height: JUNCTION_SIZE };
  }

  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

/**
 * Backend x/y represent the CENTER of the node.
 * Convert center coordinate -> top-left coordinate for CSS absolute positioning.
 */
function getNodeTopLeft(node: MapSkeletonNode) {
  const { width, height } = getNodeDimensions(node);

  return {
    x: node.position.x - width / 2,
    y: node.position.y - height / 2,
  };
}

function getDistance(a: RoadPoint, b: RoadPoint) {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

/** Same snapping Pixi uses for roads, +8 to land on the middle of the tile. */
function toRoadCenter(p: RoadPoint): RoadPoint {
  return {
    x: Math.round(p.x / ROAD_GRID) * ROAD_GRID + ROAD_CENTER,
    y: Math.round(p.y / ROAD_GRID) * ROAD_GRID + ROAD_CENTER,
  };
}

function getPointAlongRoute(
  points: RoadPoint[],
  distance: number,
): RoadPoint[] {
  if (points.length < 2) {
    return points;
  }

  const result: RoadPoint[] = [{ x: points[0].x, y: points[0].y }];

  let remaining = Math.max(distance, 0);

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    const segmentLength = getDistance(start, end);

    if (segmentLength <= 0) {
      continue;
    }

    /* The entire segment fits inside the reveal distance. */
    if (remaining >= segmentLength) {
      result.push({ x: end.x, y: end.y });
      remaining -= segmentLength;
      continue;
    }

    /* Reveal only part of this segment. */
    const ratio = remaining / segmentLength;

    result.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    });

    return result;
  }

  /* The reveal distance is longer than the entire route. */
  return result;
}

function oppositeDirection(direction: RoadDirection): RoadDirection {
  if (direction === "up") return "down";
  if (direction === "down") return "up";
  if (direction === "left") return "right";
  return "left";
}

function getRouteOrientation(source: MapSkeletonNode, target: MapSkeletonNode) {
  const deltaX = target.position.x - source.position.x;
  const deltaY = target.position.y - source.position.y;

  const isVerticallyAligned = Math.abs(deltaX) <= ALIGNMENT_EPSILON;
  const isHorizontallyAligned = Math.abs(deltaY) <= ALIGNMENT_EPSILON;

  return isVerticallyAligned ||
    (!isHorizontallyAligned && Math.abs(deltaY) >= Math.abs(deltaX))
    ? "vertical"
    : "horizontal";
}

function getEndpointSide(
  source: MapSkeletonNode,
  target: MapSkeletonNode,
  endpoint: "source" | "target",
): RoadDirection {
  const orientation = getRouteOrientation(source, target);

  if (orientation === "vertical") {
    const sourceSide = target.position.y >= source.position.y ? "down" : "up";

    return endpoint === "source" ? sourceSide : oppositeDirection(sourceSide);
  }

  const sourceSide = target.position.x >= source.position.x ? "right" : "left";

  return endpoint === "source" ? sourceSide : oppositeDirection(sourceSide);
}

function getSideConnections(
  nodeById: NodeById,
  edges: MapEdge[],
  node: MapSkeletonNode,
  side: RoadDirection,
): ConnectedEdge[] {
  const connections: ConnectedEdge[] = [];

  edges.forEach((edge) => {
    // O(1) lookups instead of scanning the whole nodes array twice per edge.
    const source = nodeById.get(String(edge.source));
    const target = nodeById.get(String(edge.target));

    if (!source || !target) {
      return;
    }

    if (
      String(source.id) === String(node.id) &&
      getEndpointSide(source, target, "source") === side
    ) {
      connections.push({ source, target, endpoint: "source" });
    }

    if (
      String(target.id) === String(node.id) &&
      getEndpointSide(source, target, "target") === side
    ) {
      connections.push({ source, target, endpoint: "target" });
    }
  });

  return connections.sort((first, second) => {
    const firstKey = `${first.source.id}:${first.target.id}:${first.endpoint}`;
    const secondKey = `${second.source.id}:${second.target.id}:${second.endpoint}`;

    return firstKey.localeCompare(secondKey);
  });
}

function getPortOffset(index: number, count: number, maxOffset: number) {
  if (count < 2) {
    return 0;
  }

  return -maxOffset + (index / (count - 1)) * maxOffset * 2;
}

function getLaneOffset(index: number, count: number) {
  return (index - (count - 1) / 2) * ROUTING_LANE_GAP;
}

function getEdgeRouting(
  nodeById: NodeById,
  edges: MapEdge[],
  source: MapSkeletonNode,
  target: MapSkeletonNode,
): EdgeRouting {
  const sourceConnections = getSideConnections(
    nodeById,
    edges,
    source,
    getEndpointSide(source, target, "source"),
  );

  const targetConnections = getSideConnections(
    nodeById,
    edges,
    target,
    getEndpointSide(source, target, "target"),
  );

  const isCurrentSource = (edge: ConnectedEdge) =>
    String(edge.source.id) === String(source.id) &&
    String(edge.target.id) === String(target.id) &&
    edge.endpoint === "source";

  const isCurrentTarget = (edge: ConnectedEdge) =>
    String(edge.source.id) === String(source.id) &&
    String(edge.target.id) === String(target.id) &&
    edge.endpoint === "target";

  const sourceIndex = sourceConnections.findIndex(isCurrentSource);
  const targetIndex = targetConnections.findIndex(isCurrentTarget);

  const sourceDimensions = getNodeDimensions(source);
  const targetDimensions = getNodeDimensions(target);

  const sourcePortOffset = getPortOffset(
    sourceIndex,
    sourceConnections.length,
    Math.min(sourceDimensions.width / 2 - 18, sourceDimensions.height / 2 - 18),
  );

  const targetPortOffset = getPortOffset(
    targetIndex,
    targetConnections.length,
    Math.min(targetDimensions.width / 2 - 18, targetDimensions.height / 2 - 18),
  );

  const laneOffset =
    sourceConnections.length > 1
      ? getLaneOffset(sourceIndex, sourceConnections.length)
      : getLaneOffset(targetIndex, targetConnections.length);

  return { sourcePortOffset, targetPortOffset, laneOffset };
}

/**
 * Pure function (no component state), so it lives at module level instead of
 * being re-created on every render.
 */
function getNodeConnectionPoints(
  source: MapSkeletonNode,
  target: MapSkeletonNode,
  routing: EdgeRouting,
): RoadPoint[] {
  const deltaX = target.position.x - source.position.x;
  const deltaY = target.position.y - source.position.y;

  const isVerticallyAligned = Math.abs(deltaX) <= ALIGNMENT_EPSILON;
  const isHorizontallyAligned = Math.abs(deltaY) <= ALIGNMENT_EPSILON;

  const isVerticalRoute = getRouteOrientation(source, target) === "vertical";

  const sourceDimensions = getNodeDimensions(source);
  const targetDimensions = getNodeDimensions(target);

  if (isVerticalRoute) {
    const direction = deltaY >= 0 ? 1 : -1;

    /*
     * Start slightly INSIDE the source node and end slightly INSIDE the
     * target node. Nodes render above the Pixi roads, so the overlap is
     * hidden and prevents visible gaps.
     */
    const sourceX = source.position.x + routing.sourcePortOffset;
    const targetX = target.position.x + routing.targetPortOffset;

    const sourceY =
      source.position.y +
      direction * (sourceDimensions.height / 2 + ROAD_NODE_OVERLAP);

    const targetY =
      target.position.y -
      direction * (targetDimensions.height / 2 + ROAD_NODE_OVERLAP);

    if (isVerticallyAligned && Math.abs(sourceX - targetX) <= ALIGNMENT_EPSILON) {
      return [
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
      ];
    }

    const midpoint = (sourceY + targetY) / 2;
    const maxLaneOffset = Math.max(0, Math.abs(targetY - sourceY) / 2 - 12);

    const bendY =
      midpoint +
      Math.max(-maxLaneOffset, Math.min(maxLaneOffset, routing.laneOffset));

    return [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: bendY },
      { x: targetX, y: bendY },
      { x: targetX, y: targetY },
    ];
  }

  const direction = deltaX >= 0 ? 1 : -1;

  const sourceX =
    source.position.x +
    direction * (sourceDimensions.width / 2 + ROAD_NODE_OVERLAP);

  const targetX =
    target.position.x -
    direction * (targetDimensions.width / 2 + ROAD_NODE_OVERLAP);

  const sourceY = source.position.y + routing.sourcePortOffset;
  const targetY = target.position.y + routing.targetPortOffset;

  if (isHorizontallyAligned && Math.abs(sourceY - targetY) <= ALIGNMENT_EPSILON) {
    return [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ];
  }

  const midpoint = (sourceX + targetX) / 2;
  const maxLaneOffset = Math.max(0, Math.abs(targetX - sourceX) / 2 - 12);

  const bendX =
    midpoint +
    Math.max(-maxLaneOffset, Math.min(maxLaneOffset, routing.laneOffset));

  return [
    { x: sourceX, y: sourceY },
    { x: bendX, y: sourceY },
    { x: bendX, y: targetY },
    { x: targetX, y: targetY },
  ];
}

/* -------------------------------------------------------------------------- */
/*                       MEMOIZED SUB-COMPONENTS                              */
/* -------------------------------------------------------------------------- */

/**
 * Fog reveal shapes in WORLD coordinates. Their props don't depend on the
 * camera, so React skips this whole subtree while panning / zooming.
 */
const FogRevealShapes = memo(function FogRevealShapes({
  nodes,
  paths,
}: {
  nodes: FogNode[];
  paths: FogPath[];
}) {
  return (
    <>
      {nodes.map((n) => (
        <circle
          key={`fog-node-${n.id}`}
          cx={n.x}
          cy={n.y}
          r={n.radius}
          fill="black"
        />
      ))}

      {paths.map((p) => (
        <polyline
          key={`fog-road-${p.id}`}
          points={p.points}
          fill="none"
          stroke="black"
          strokeWidth={p.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
});

/**
 * All node buttons. Props are stable while the camera moves, so React skips
 * re-rendering every node on each pan / zoom event.
 */
const NodeLayer = memo(function NodeLayer({
  nodes,
  visibleNodeIds,
  visitedNodeIds,
  currentNodeId,
  onNodeClick,
}: {
  nodes: MapSkeletonNode[];
  visibleNodeIds: Set<string>;
  visitedNodeIds: Set<string>;
  currentNodeId: string | null;
  onNodeClick: (node: MapSkeletonNode) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (!visibleNodeIds.has(String(node.id))) {
          return null;
        }

        const nodeId = String(node.id);
        const isCurrent = nodeId === currentNodeId;
        const isVisited = visitedNodeIds.has(nodeId);
        const position = getNodeTopLeft(node);
        const dimensions = getNodeDimensions(node);
        const isJunction = node.effects === "JUNCTION";

        return (
          <button
            key={node.id}
            type="button"
            data-map-node
            onClick={(event) => {
              event.stopPropagation();
              onNodeClick(node);
            }}
            className="absolute box-border flex items-center justify-center select-none transition-[filter] duration-150"
            style={{
              left: position.x,
              top: position.y,
              width: dimensions.width,
              height: dimensions.height,
              backgroundImage: `url(${isJunction ? "/map/junction.png" : "/map/node.png"})`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              imageRendering: "pixelated",
              filter: isCurrent
                ? "drop-shadow(0 0 10px rgba(255,236,140,0.9)) brightness(1.1)"
                : isVisited
                  ? "none"
                  : "grayscale(1) brightness(0.6)",
            }}
          >
            {isJunction ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                <span className="text-xl leading-none opacity-80">✦</span>

                <span className="text-[11px] leading-tight text-[#3a2a18]">
                  {node.id}
                </span>
              </div>
            ) : isVisited ? (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] text-[#3a2a18]/60">#{node.id}</span>

                <span className="text-[13px] leading-tight text-[#3a2a18]">
                  {node.id}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1">
                <span className="text-lg text-[#3a2a18]/50">?</span>

                <span className="text-[9px] uppercase tracking-widest text-[#3a2a18]/50">
                  Unknown
                </span>
              </div>
            )}
          </button>
        );
      })}
    </>
  );
});

/* -------------------------------------------------------------------------- */
/*                                COMPONENT                                   */
/* -------------------------------------------------------------------------- */

export default function Map() {
  /* ------------------------------------------------------------------------ */
  /*                              REFS                                        */
  /* ------------------------------------------------------------------------ */

  const walkerRef = useRef<HTMLDivElement | null>(null);
  const walkerSpriteRef = useRef<HTMLDivElement | null>(null);
  const walkerDoneKeyRef = useRef<string | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const panStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    cameraX: number;
    cameraY: number;
  } | null>(null);

  /* ------------------------------------------------------------------------ */
  /*                              STATE                                       */
  /* ------------------------------------------------------------------------ */

  /** Camera is UI state. It is NOT part of the backend map. */
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });

  const [isPanning, setIsPanning] = useState(false);

  /* ------------------------------------------------------------------------ */
  /*                            MAP DATA                                      */
  /* ------------------------------------------------------------------------ */

  const { data: visitedNodesData } = useGetVisitedNodes();

  const { data: mapSkeleton } = useGetMapSkeleton();

  const nodes = useMemo(() => mapSkeleton?.nodes || [], [mapSkeleton]);
  const edges = useMemo(() => mapSkeleton?.edges || [], [mapSkeleton]);

  const visitedNodeIds = useMemo(
    () =>
      new Set((visitedNodesData?.visited_nodes ?? []).map((id) => String(id))),
    [visitedNodesData],
  );

  const currentNodeId = useMemo(() => {
    const visitedNodes = visitedNodesData?.visited_nodes ?? [];

    return visitedNodes.length > 0
      ? String(visitedNodes[visitedNodes.length - 1])
      : null;
  }, [visitedNodesData]);

  // Only visited nodes are visible (same set).
  const visibleNodeIds = visitedNodeIds;

  /* ------------------------------------------------------------------------ */
  /*                            LOOKUPS                                       */
  /* ------------------------------------------------------------------------ */

  const nodeById = useMemo<NodeById>(
    () => new globalThis.Map(nodes.map((node) => [String(node.id), node])),
    [nodes],
  );

  const edgeById = useMemo(
    () => new globalThis.Map(edges.map((edge) => [String(edge.id), edge])),
    [edges],
  );

  /* ------------------------------------------------------------------------ */
  /*                             FIT MAP                                      */
  /* ------------------------------------------------------------------------ */

  const fitMap = useCallback(() => {
    const viewport = viewportRef.current;

    if (!viewport || nodes.length === 0) {
      return;
    }

    /** Calculate the complete world bounding box. */
    const bounds = nodes.reduce(
      (result, node) => {
        const { width, height } = getNodeDimensions(node);

        return {
          minX: Math.min(result.minX, node.position.x - width / 2),
          maxX: Math.max(result.maxX, node.position.x + width / 2),
          minY: Math.min(result.minY, node.position.y - height / 2),
          maxY: Math.max(result.maxY, node.position.y + height / 2),
        };
      },
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      },
    );

    const graphWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 1);

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;

    const availableWidth = Math.max(viewportWidth - FIT_PADDING * 2, 1);
    const availableHeight = Math.max(viewportHeight - FIT_PADDING * 2, 1);

    const nextZoom = clamp(
      Math.min(availableWidth / graphWidth, availableHeight / graphHeight),
      MIN_ZOOM,
      MAX_ZOOM,
    );

    const graphCenterX = (bounds.minX + bounds.maxX) / 2;
    const graphCenterY = (bounds.minY + bounds.maxY) / 2;

    setCamera({
      zoom: nextZoom,
      x: viewportWidth / 2 - graphCenterX * nextZoom,
      y: viewportHeight / 2 - graphCenterY * nextZoom,
    });
  }, [nodes]);

  /* ------------------------------------------------------------------------ */
  /*                         INITIAL CAMERA                                   */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fitMap();
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [fitMap]);

  /* ------------------------------------------------------------------------ */
  /*                                PAN                                       */
  /* ------------------------------------------------------------------------ */

  const handleViewportPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    /** Only respond to primary mouse button. */
    if (event.button !== 0) {
      return;
    }

    /** Don't pan when clicking a node. */
    const target = event.target as HTMLElement;

    if (target.closest("[data-map-node]")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
    };

    setIsPanning(true);
  };

  const handleViewportPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const panStart = panStartRef.current;

    if (!panStart) {
      return;
    }

    const deltaX = event.clientX - panStart.pointerX;
    const deltaY = event.clientY - panStart.pointerY;

    setCamera((current) => ({
      ...current,
      x: panStart.cameraX + deltaX,
      y: panStart.cameraY + deltaY,
    }));
  };

  const handleViewportPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    panStartRef.current = null;
    setIsPanning(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /* ------------------------------------------------------------------------ */
  /*                                ZOOM                                      */
  /* ------------------------------------------------------------------------ */

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    /** Mouse position inside viewport. */
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    setCamera((current) => {
      const direction = event.deltaY < 0 ? 1 : -1;

      const nextZoom = clamp(
        current.zoom + direction * ZOOM_STEP,
        MIN_ZOOM,
        MAX_ZOOM,
      );

      if (nextZoom === current.zoom) {
        return current;
      }

      /** Convert mouse screen coordinate to WORLD coordinate. */
      const worldX = (mouseX - current.x) / current.zoom;
      const worldY = (mouseY - current.y) / current.zoom;

      /** Keep that exact world point underneath the cursor. */
      return {
        zoom: nextZoom,
        x: mouseX - worldX * nextZoom,
        y: mouseY - worldY * nextZoom,
      };
    });
  };

  /* ------------------------------------------------------------------------ */
  /*                            NODE CLICK                                    */
  /* ------------------------------------------------------------------------ */

  // Stable identity, otherwise the memoized NodeLayer would re-render anyway.
  const handleNodeClick = useCallback((node: MapSkeletonNode) => {
    console.log("Selected node:", node);
  }, []);

  /* ------------------------------------------------------------------------ */
  /*                         CONNECTION DATA                                  */
  /* ------------------------------------------------------------------------ */

  const pixiEdges = useMemo(() => {
    return edges.flatMap((edge) => {
      const source = nodeById.get(String(edge.source));
      const target = nodeById.get(String(edge.target));

      if (!source || !target) {
        return [];
      }

      const routing = getEdgeRouting(nodeById, edges, source, target);

      const points = getNodeConnectionPoints(source, target, routing);

      if (points.length < 2) {
        return [];
      }

      return [
        {
          id: String(edge.id),
          points,
          endpointCaps: { start: true, end: true },
          isSelected: false,
        },
      ];
    });
  }, [edges, nodeById]);

  /* ------------------------------------------------------------------------ */
  /*                              WALKER                                      */
  /* ------------------------------------------------------------------------ */

  // Stable string: only changes when the visited list really changes,
  // not when react-query refetches identical data.
  const visitedKey = useMemo(
    () => (visitedNodesData?.visited_nodes ?? []).map(String).join("|"),
    [visitedNodesData],
  );

  const walkerRoute = useMemo(() => {
    const visited = visitedKey ? visitedKey.split("|") : [];
    if (visited.length === 0) return null;

    const currentId = visited[visited.length - 1];
    const cur = nodeById.get(currentId);
    if (!cur) return null;

    const stand = {
      key: `stand>${currentId}`,
      points: [{ x: cur.position.x, y: cur.position.y }],
    };
    if (visited.length < 2) return stand;

    const prevId = visited[visited.length - 2];
    const prev = nodeById.get(prevId);
    const edge = edges.find((e) => {
      const s = String(e.source);
      const t = String(e.target);
      return (
        (s === prevId && t === currentId) || (s === currentId && t === prevId)
      );
    });
    const pixiEdge = edge && pixiEdges.find((p) => p.id === String(edge.id));
    if (!prev || !edge || !pixiEdge) return stand;

    const ordered =
      String(edge.source) === prevId
        ? pixiEdge.points
        : [...pixiEdge.points].reverse();

    // Match the road as Pixi draws it, and drop duplicate points.
    const road = ordered
      .map(toRoadCenter)
      .filter(
        (p, i, arr) =>
          i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y,
      );
    if (road.length < 2) return stand;

    // Extend the first/last segment straight to the node centre line so the
    // walker starts on the previous node and ends on the current one.
    const first = road[0];
    const second = road[1];
    const last = road[road.length - 1];
    const beforeLast = road[road.length - 2];

    const startExtra =
      second.x === first.x
        ? { x: first.x, y: prev.position.y }
        : { x: prev.position.x, y: first.y };

    const endExtra =
      last.x === beforeLast.x
        ? { x: last.x, y: cur.position.y }
        : { x: cur.position.x, y: last.y };

    return {
      key: `${prevId}>${currentId}`,
      points: [startExtra, ...road, endExtra],
    };
  }, [visitedKey, nodeById, edges, pixiEdges]);

  useEffect(() => {
    const walker = walkerRef.current;
    const sprite = walkerSpriteRef.current;
    if (!walkerRoute || !walker || !sprite) return;

    const { key, points } = walkerRoute;

    const place = (x: number, y: number) => {
      walker.style.transform = `translate(${x - WALKER_SIZE / 2}px, ${y - WALKER_FOOT_Y}px)`;
    };

    // The frame + direction are written straight into background-position,
    // so no external CSS / keyframes are needed.
    const setPose = (
      facing: "down" | "up" | "left" | "right",
      frame: number,
    ) => {
      const row = facing === "down" ? 0 : facing === "up" ? 1 : 2;
      sprite.style.backgroundPosition = `-${frame * WALKER_SIZE}px -${row * WALKER_SIZE}px`;
      sprite.style.transform = facing === "left" ? "scaleX(-1)" : "none";
    };

    const segs: { a: RoadPoint; b: RoadPoint; len: number; start: number }[] =
      [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const len = getDistance(points[i], points[i + 1]);
      if (len > 0) {
        segs.push({ a: points[i], b: points[i + 1], len, start: total });
        total += len;
      }
    }

    const last = points[points.length - 1];

    // Already walked this hop, or nothing to walk: just stand at the node.
    if (walkerDoneKeyRef.current === key || segs.length === 0) {
      setPose("down", 0);
      place(last.x, last.y);
      walker.style.visibility = "visible";
      walkerDoneKeyRef.current = key;
      return;
    }

    // Place BEFORE showing, so there is no flash at (0,0).
    place(points[0].x, points[0].y);
    setPose("down", 0);
    walker.style.visibility = "visible";

    let startTime: number | null = null;
    let raf = 0;
    let lastFacing = "";
    let lastFrame = -1;

    const step = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = (now - startTime) / 1000;
      const dist = Math.min(elapsed * WALKER_SPEED, total);

      const seg =
        segs.find((s) => dist <= s.start + s.len) ?? segs[segs.length - 1];
      const t = (dist - seg.start) / seg.len;

      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;

      place(seg.a.x + dx * t, seg.a.y + dy * t);

      const facing =
        Math.abs(dx) > Math.abs(dy)
          ? dx >= 0
            ? "right"
            : "left"
          : dy >= 0
            ? "down"
            : "up";
      const frame = Math.floor(elapsed * WALKER_FPS) % WALKER_FRAMES;

      if (facing !== lastFacing || frame !== lastFrame) {
        lastFacing = facing;
        lastFrame = frame;
        setPose(facing, frame);
      }

      if (dist < total) {
        raf = requestAnimationFrame(step);
      } else {
        setPose("down", 0);
        walkerDoneKeyRef.current = key;
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [walkerRoute]);

  /* ------------------------------------------------------------------------ */
  /*                        VISIBLE ROADS / FOG DATA                          */
  /* ------------------------------------------------------------------------ */

  const visiblePixiEdges = useMemo(() => {
    if (!currentNodeId) {
      return [];
    }

    return pixiEdges.flatMap((edge) => {
      const backendEdge = edgeById.get(edge.id);

      if (!backendEdge) {
        return [];
      }

      const sourceId = String(backendEdge.source);
      const targetId = String(backendEdge.target);

      const sourceVisited = visitedNodeIds.has(sourceId);
      const targetVisited = visitedNodeIds.has(targetId);

      const sourceIsCurrent = sourceId === currentNodeId;
      const targetIsCurrent = targetId === currentNodeId;

      /* CASE 1: both endpoints visited -> road is permanently discovered. */
      if (sourceVisited && targetVisited) {
        return [
          {
            ...edge,
            endpointCaps: { start: true, end: true },
          },
        ];
      }

      /* CASE 2: unexplored road connected to the current node (source side). */
      if (sourceIsCurrent && !targetVisited) {
        const partialPoints = getPointAlongRoute(
          edge.points,
          CURRENT_NODE_REVEAL_DISTANCE,
        );

        if (partialPoints.length < 2) {
          return [];
        }

        return [
          {
            ...edge,
            points: partialPoints,
            endpointCaps: { start: true, end: false },
          },
        ];
      }

      /* The route may run the other way: reverse when current is the target. */
      if (targetIsCurrent && !sourceVisited) {
        const reversedPoints = [...edge.points].reverse();

        const partialPoints = getPointAlongRoute(
          reversedPoints,
          CURRENT_NODE_REVEAL_DISTANCE,
        );

        if (partialPoints.length < 2) {
          return [];
        }

        return [
          {
            ...edge,
            points: partialPoints.reverse(),
            endpointCaps: { start: false, end: true },
          },
        ];
      }

      /* CASE 3: undiscovered and not connected to the current node: hidden. */
      return [];
    });
  }, [pixiEdges, edgeById, visitedNodeIds, currentNodeId]);

  // Fog shapes are in WORLD coordinates: no dependency on the camera.
  const fogRevealNodes = useMemo<FogNode[]>(
    () =>
      nodes
        .filter((n) => visibleNodeIds.has(String(n.id)))
        .map((n) => ({
          id: String(n.id),
          x: n.position.x,
          y: n.position.y,
          radius: FOG_NODE_REVEAL_RADIUS,
        })),
    [nodes, visibleNodeIds],
  );

  const fogRevealPaths = useMemo<FogPath[]>(
    () =>
      visiblePixiEdges.map((e) => ({
        id: e.id,
        points: e.points.map((p) => `${p.x},${p.y}`).join(" "),
        strokeWidth: FOG_PATH_REVEAL_WIDTH,
      })),
    [visiblePixiEdges],
  );

  /* ------------------------------------------------------------------------ */
  /*                                RENDER                                    */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="map-maker-workspace flex h-screen min-h-0 w-full flex-col overflow-hidden bg-[#0b0f14] text-white">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}

      {/* <header className="z-20 select-none flex h-16 shrink-0 items-center justify-between border-b border-white/8 bg-[#10161d] px-5">
        <div>
          <h1 className="m-0 text-lg font-bold">Treasure Hunt</h1>

          <span className="mt-0.5 block text-xs text-white/50">
            Explore the hidden map
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fitMap}
            className="rounded-md border border-white/12 bg-[#171f28] px-3 py-2 text-xs text-white transition-colors hover:bg-[#202b36]"
          >
            Reset View
          </button>

          <span className="min-w-12 text-center text-xs text-white/60">
            {Math.round(camera.zoom * 100)}%
          </span>
        </div>
      </header> */}

      {/* ================================================================== */}
      {/* VIEWPORT                                                           */}
      {/* ================================================================== */}

      <div
        ref={viewportRef}
        className={[
          "relative min-h-0 flex-1 overflow-hidden",
          "touch-none",
          "bg-[#060E08]",
          "cursor-grab",
          isPanning ? "cursor-grabbing" : "",
        ].join(" ")}
        style={{
          backgroundColor: "#5ea040",
          backgroundImage: "url(/map/grass-tile.png)",
          backgroundRepeat: "repeat",
          backgroundSize: `${BG_TILE_SIZE * camera.zoom}px ${BG_TILE_SIZE * camera.zoom}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          imageRendering: "pixelated",
        }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        onWheel={handleWheel}
      >
        {/* ================================================================ */}
        {/* FOG                                                              */}
        {/* ================================================================ */}

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        >
          <defs>
            <filter
              id="map-fog-blur"
              filterUnits="userSpaceOnUse"
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation={FOG_BLUR_RADIUS * camera.zoom} />
            </filter>

            <mask
              id="map-fog-mask"
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100%"
              height="100%"
            >
              {/* Everything starts hidden by the fog (screen space) */}
              <rect x="0" y="0" width="100%" height="100%" fill="white" />

              {/* Reveal shapes: world space, moved by ONE transform */}
              <g filter="url(#map-fog-blur)">
                <g
                  transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
                >
                  <FogRevealShapes
                    nodes={fogRevealNodes}
                    paths={fogRevealPaths}
                  />
                </g>
              </g>
            </mask>
          </defs>

          {/* Dark fog */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(2, 5, 8, 0.7)"
            mask="url(#map-fog-mask)"
          />
        </svg>

        <PixiRoadLayer
          edges={visiblePixiEdges}
          pan={{
            x: camera.x,
            y: camera.y,
          }}
          zoom={camera.zoom}
        />

        {/* ================================================================ */}
        {/* NODE WORLD                                                       */}
        {/* ================================================================ */}

        <div
          className="absolute left-0 top-0 z-0 h-px w-px origin-top-left"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          <div className="absolute left-0 top-0 h-px w-px">
            <NodeLayer
              nodes={nodes}
              visibleNodeIds={visibleNodeIds}
              visitedNodeIds={visitedNodeIds}
              currentNodeId={currentNodeId}
              onNodeClick={handleNodeClick}
            />

            {/*
              Walker. All styling is inline (no external CSS needed).
              Position, frame and direction are written imperatively by the
              walker effect, so they are intentionally NOT in these style props.
            */}
            <div
              ref={walkerRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: WALKER_SIZE,
                height: WALKER_SIZE,
                zIndex: 10,
                pointerEvents: "none",
                willChange: "transform",
                visibility: "hidden",
              }}
            >
              <div
                ref={walkerSpriteRef}
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundImage: "url(/map/walker.png)",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${WALKER_SIZE * WALKER_FRAMES}px ${WALKER_SIZE * 3}px`,
                  imageRendering: "pixelated",
                }}
              />
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* SCREEN-SPACE VIGNETTE                                            */}
        {/* ================================================================ */}

        {/* <div
  aria-hidden="true"
  className="pointer-events-none absolute inset-0 z-30"
  style={{
    background:
      "radial-gradient(circle at center, transparent 35%, rgba(0, 0, 0, 0.65) 100%)",
  }}
/> */}

        {/* {visibleNodeIds.size === 0 && (
          <div className="select-none pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-white z-30">
            Start exploring the map by visiting a node.
          </div>
        )} */}

        {/* ================================================================ */}
        {/* EMPTY MAP                                                        */}
        {/* ================================================================ */}

        {nodes.length === 0 && (
          <div className="select-none pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white z-30">
            No map available.
          </div>
        )}

        {/* ================================================================ */}
        {/* MAP HELP                                                         */}
        {/* ================================================================ */}

        <div className="select-none pointer-events-none absolute bottom-4 left-4 flex gap-2.5 rounded-md border border-white/8 bg-[#0a0f14]/80 px-2.5 py-2 text-[10px] text-white/45 backdrop-blur-md">
          <span>Drag to move</span>

          <span>Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}
