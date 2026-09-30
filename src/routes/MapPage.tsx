import { PixiRoadLayer } from "@/components/map-maker/PixiRoadLayer";
import { useGetMapSkeleton } from "@/hooks/queries/useGetMap";
import { useGetVisitedNodes } from "@/hooks/queries/useGetVisitedNodes";
import type { MapSkeletonNode } from "@/types/map";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

type Camera = {
  /**
   * Camera translation in SCREEN coordinates.
   */
  x: number;
  y: number;

  /**
   * Camera zoom.
   */
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

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getNodeDimensions(node: MapSkeletonNode) {
  if (node.effects === "JUNCTION") {
    return {
      width: JUNCTION_SIZE,
      height: JUNCTION_SIZE,
    };
  }

  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  };
}

/**
 * Backend x/y represent the CENTER of the node.
 *
 * Convert center coordinate -> top-left coordinate
 * for CSS absolute positioning.
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

function getPointAlongRoute(
  points: RoadPoint[],
  distance: number,
): RoadPoint[] {
  if (points.length < 2) {
    return points;
  }

  const result: RoadPoint[] = [
    {
      x: points[0].x,
      y: points[0].y,
    },
  ];

  let remaining = Math.max(distance, 0);

  for (
    let index = 0;
    index < points.length - 1;
    index += 1
  ) {
    const start = points[index];
    const end = points[index + 1];

    const segmentLength = getDistance(start, end);

    if (segmentLength <= 0) {
      continue;
    }

    /*
     * The entire segment fits inside the reveal distance.
     */
    if (remaining >= segmentLength) {
      result.push({
        x: end.x,
        y: end.y,
      });

      remaining -= segmentLength;
      continue;
    }

    /*
     * Reveal only part of this segment.
     */
    const ratio = remaining / segmentLength;

    result.push({
      x:
        start.x +
        (end.x - start.x) * ratio,
      y:
        start.y +
        (end.y - start.y) * ratio,
    });

    return result;
  }

  /*
   * The requested reveal distance is longer than the
   * entire route, so return the complete route.
   */
  return result;
}

function worldToScreen(
    point: RoadPoint,
    camera: Camera,
  ): RoadPoint {
    return {
      x: camera.x + point.x * camera.zoom,
      y: camera.y + point.y * camera.zoom,
    };
  }

function oppositeDirection(
  direction: RoadDirection,
): RoadDirection {
  if (direction === "up") {
    return "down";
  }

  if (direction === "down") {
    return "up";
  }

  if (direction === "left") {
    return "right";
  }

  return "left";
}

function getRouteOrientation(
  source: MapSkeletonNode,
  target: MapSkeletonNode,
) {
  const deltaX = target.position.x - source.position.x;
  const deltaY = target.position.y - source.position.y;

  const isVerticallyAligned =
    Math.abs(deltaX) <= ALIGNMENT_EPSILON;

  const isHorizontallyAligned =
    Math.abs(deltaY) <= ALIGNMENT_EPSILON;

  return isVerticallyAligned ||
    (
      !isHorizontallyAligned &&
      Math.abs(deltaY) >= Math.abs(deltaX)
    )
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
    const sourceSide =
      target.position.y >= source.position.y
        ? "down"
        : "up";

    return endpoint === "source"
      ? sourceSide
      : oppositeDirection(sourceSide);
  }

  const sourceSide =
    target.position.x >= source.position.x
      ? "right"
      : "left";

  return endpoint === "source"
    ? sourceSide
    : oppositeDirection(sourceSide);
}

function getSideConnections(
  nodes: MapSkeletonNode[],
  edges: MapEdge[],
  node: MapSkeletonNode,
  side: RoadDirection,
): ConnectedEdge[] {
  const connections: ConnectedEdge[] = [];

  edges.forEach((edge) => {
    const source = nodes.find(
      (candidate) =>
        String(candidate.id) === String(edge.source),
    );

    const target = nodes.find(
      (candidate) =>
        String(candidate.id) === String(edge.target),
    );

    if (!source || !target) {
      return;
    }

    if (
      String(source.id) === String(node.id) &&
      getEndpointSide(source, target, "source") === side
    ) {
      connections.push({
        source,
        target,
        endpoint: "source",
      });
    }

    if (
      String(target.id) === String(node.id) &&
      getEndpointSide(source, target, "target") === side
    ) {
      connections.push({
        source,
        target,
        endpoint: "target",
      });
    }
  });

  return connections.sort((first, second) => {
    const firstKey =
      `${first.source.id}:${first.target.id}:${first.endpoint}`;

    const secondKey =
      `${second.source.id}:${second.target.id}:${second.endpoint}`;

    return firstKey.localeCompare(secondKey);
  });
}

function getPortOffset(
  index: number,
  count: number,
  maxOffset: number,
) {
  if (count < 2) {
    return 0;
  }

  return (
    -maxOffset +
    (index / (count - 1)) * maxOffset * 2
  );
}

function getLaneOffset(
  index: number,
  count: number,
) {
  return (
    (index - (count - 1) / 2) *
    ROUTING_LANE_GAP
  );
}

function getEdgeRouting(
  nodes: MapSkeletonNode[],
  edges: MapEdge[],
  source: MapSkeletonNode,
  target: MapSkeletonNode,
): EdgeRouting {
  const sourceConnections = getSideConnections(
    nodes,
    edges,
    source,
    getEndpointSide(source, target, "source"),
  );

  const targetConnections = getSideConnections(
    nodes,
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

  const sourceIndex =
    sourceConnections.findIndex(isCurrentSource);

  const targetIndex =
    targetConnections.findIndex(isCurrentTarget);

  const sourceDimensions =
    getNodeDimensions(source);

  const targetDimensions =
    getNodeDimensions(target);

  const sourcePortOffset = getPortOffset(
    sourceIndex,
    sourceConnections.length,
    Math.min(
      sourceDimensions.width / 2 - 18,
      sourceDimensions.height / 2 - 18,
    ),
  );

  const targetPortOffset = getPortOffset(
    targetIndex,
    targetConnections.length,
    Math.min(
      targetDimensions.width / 2 - 18,
      targetDimensions.height / 2 - 18,
    ),
  );

  const laneOffset =
    sourceConnections.length > 1
      ? getLaneOffset(
          sourceIndex,
          sourceConnections.length,
        )
      : getLaneOffset(
          targetIndex,
          targetConnections.length,
        );

  return {
    sourcePortOffset,
    targetPortOffset,
    laneOffset,
  };
}

/* -------------------------------------------------------------------------- */
/*                                COMPONENT                                   */
/* -------------------------------------------------------------------------- */

export default function Map() {
  /* ------------------------------------------------------------------------ */
  /*                              REFS                                        */
  /* ------------------------------------------------------------------------ */

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

  /**
   * Camera is UI state.
   *
   * It is NOT part of the backend map.
   */
  const [camera, setCamera] = useState<Camera>({
    x: 0,
    y: 0,
    zoom: 1,
  });

  const [isPanning, setIsPanning] = useState(false);

  /* ------------------------------------------------------------------------ */
  /*                            MAP DATA                                      */
  /* ------------------------------------------------------------------------ */

  /**
   * Eventually replace these with your API query.
   *
   * DO NOT modify node x/y when panning or zooming.
   */

  const { data: visitedNodesData } = useGetVisitedNodes();

  const {
    data: mapSkeleton,
    // isError: isMapLoadError,
    // isPending: isMapLoading,
  } = useGetMapSkeleton();

  const nodes = useMemo(() => mapSkeleton?.nodes || [], [mapSkeleton]);
  const edges = useMemo(() => mapSkeleton?.edges || [], [mapSkeleton]);

  const visitedNodeIds = useMemo(
  () =>
    new Set(
      (visitedNodesData?.visited_nodes ?? []).map((id) =>
        String(id),
      ),
    ),
  [visitedNodesData],
);

  const currentNodeId = useMemo(() => {
    const visitedNodes = visitedNodesData?.visited_nodes ?? [];

    return visitedNodes.length > 0
      ? String(visitedNodes[visitedNodes.length - 1])
      : null;
  }, [visitedNodesData]);

  const visibleNodeIds = useMemo(() => {
    const visible = new Set<string>();

    visitedNodeIds.forEach((nodeId) => {
      visible.add(String(nodeId));
    });

    return visible;
  }, [visitedNodeIds]);

  // const adjacentNodeIds = useMemo(() => {
  //   if (!currentNodeId) {
  //     return new Set<string>();
  //   }

  //   const adjacent = new Set<string>();

  //   edges.forEach((edge) => {
  //     if (String(edge.source) === currentNodeId) {
  //       adjacent.add(String(edge.target));
  //     }

  //     if (String(edge.target) === currentNodeId) {
  //       adjacent.add(String(edge.source));
  //     }
  //   });

  //   return adjacent;
  // }, [edges, currentNodeId]);

  // const visibleNodeIds = useMemo(() => {
  //   const visible = new Set<string>();

  //   visitedNodeIds.forEach((nodeId) => {
  //     visible.add(String(nodeId));
  //   });

  //   return visible;
  // }, [visitedNodeIds]);

  /* ------------------------------------------------------------------------ */
  /*                            NODE LOOKUP                                   */
  /* ------------------------------------------------------------------------ */

  const nodeMap = useMemo(
    () => new globalThis.Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  /* ------------------------------------------------------------------------ */
  /*                             FIT MAP                                      */
  /* ------------------------------------------------------------------------ */

  const fitMap = useCallback(() => {
    const viewport = viewportRef.current;

    if (!viewport || nodes.length === 0) {
      return;
    }

    /**
     * Calculate the complete world bounding box.
     */
    const bounds = nodes.reduce(
      (result, node) => {
        const { width, height } = getNodeDimensions(node);

        const left = node.position.x - width / 2;

        const right = node.position.x + width / 2;

        const top = node.position.y - height / 2;

        const bottom = node.position.y + height / 2;

        return {
          minX: Math.min(result.minX, left),

          maxX: Math.max(result.maxX, right),

          minY: Math.min(result.minY, top),

          maxY: Math.max(result.maxY, bottom),
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
    /**
     * Only respond to primary mouse button.
     */
    if (event.button !== 0) {
      return;
    }

    /**
     * Don't pan when clicking a node.
     */
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

    /**
     * Mouse position inside viewport.
     */
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

      /**
       * Convert mouse screen coordinate
       * to WORLD coordinate.
       */
      const worldX = (mouseX - current.x) / current.zoom;

      const worldY = (mouseY - current.y) / current.zoom;

      /**
       * Keep that exact world point
       * underneath the cursor.
       */
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

  const handleNodeClick = (node: MapSkeletonNode) => {
    console.log("Selected node:", node);
  };

  /* ------------------------------------------------------------------------ */
  /*                         CONNECTION DATA                                  */
  /* ------------------------------------------------------------------------ */


function getNodeConnectionPoints(
  source: MapSkeletonNode,
  target: MapSkeletonNode,
  routing: EdgeRouting,
): RoadPoint[] {
  const deltaX =
    target.position.x - source.position.x;

  const deltaY =
    target.position.y - source.position.y;

  const isVerticallyAligned =
    Math.abs(deltaX) <= ALIGNMENT_EPSILON;

  const isHorizontallyAligned =
    Math.abs(deltaY) <= ALIGNMENT_EPSILON;

  const isVerticalRoute =
    getRouteOrientation(source, target) === "vertical";

  const sourceDimensions =
    getNodeDimensions(source);

  const targetDimensions =
    getNodeDimensions(target);

  if (isVerticalRoute) {
    const direction = deltaY >= 0 ? 1 : -1;

    /*
     * Start slightly INSIDE the source node and end slightly
     * INSIDE the target node.
     *
     * The nodes are rendered above Pixi roads, so this overlap
     * is hidden by the node itself and prevents visible gaps.
     */
    const sourceX =
      source.position.x +
      routing.sourcePortOffset;

    const targetX =
      target.position.x +
      routing.targetPortOffset;

    const sourceY =
      source.position.y +
      direction *
        (sourceDimensions.height / 2 + ROAD_NODE_OVERLAP);

    const targetY =
      target.position.y -
      direction *
        (targetDimensions.height / 2 + ROAD_NODE_OVERLAP);

    if (
      isVerticallyAligned &&
      Math.abs(sourceX - targetX) <=
        ALIGNMENT_EPSILON
    ) {
      return [
        {
          x: sourceX,
          y: sourceY,
        },
        {
          x: targetX,
          y: targetY,
        },
      ];
    }

    const midpoint =
      (sourceY + targetY) / 2;

    const maxLaneOffset = Math.max(
      0,
      Math.abs(targetY - sourceY) / 2 - 12,
    );

    const bendY =
      midpoint +
      Math.max(
        -maxLaneOffset,
        Math.min(
          maxLaneOffset,
          routing.laneOffset,
        ),
      );

    return [
      {
        x: sourceX,
        y: sourceY,
      },
      {
        x: sourceX,
        y: bendY,
      },
      {
        x: targetX,
        y: bendY,
      },
      {
        x: targetX,
        y: targetY,
      },
    ];
  }

  const direction = deltaX >= 0 ? 1 : -1;

  const sourceX =
    source.position.x +
    direction *
      (sourceDimensions.width / 2 + ROAD_NODE_OVERLAP);

  const targetX =
    target.position.x -
    direction *
      (targetDimensions.width / 2 + ROAD_NODE_OVERLAP);

  const sourceY =
    source.position.y +
    routing.sourcePortOffset;

  const targetY =
    target.position.y +
    routing.targetPortOffset;

  if (
    isHorizontallyAligned &&
    Math.abs(sourceY - targetY) <=
      ALIGNMENT_EPSILON
  ) {
    return [
      {
        x: sourceX,
        y: sourceY,
      },
      {
        x: targetX,
        y: targetY,
      },
    ];
  }

  const midpoint =
    (sourceX + targetX) / 2;

  const maxLaneOffset = Math.max(
    0,
    Math.abs(targetX - sourceX) / 2 - 12,
  );

  const bendX =
    midpoint +
    Math.max(
      -maxLaneOffset,
      Math.min(
        maxLaneOffset,
        routing.laneOffset,
      ),
    );

  return [
    {
      x: sourceX,
      y: sourceY,
    },
    {
      x: bendX,
      y: sourceY,
    },
    {
      x: bendX,
      y: targetY,
    },
    {
      x: targetX,
      y: targetY,
    },
  ];
}

  const pixiEdges = useMemo(() => {
  return edges.flatMap((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);

    if (!source || !target) {
      return [];
    }

    const routing = getEdgeRouting(
      nodes,
      edges,
      source,
      target,
    );

    const points = getNodeConnectionPoints(
      source,
      target,
      routing,
    );

    if (points.length < 2) {
      return [];
    }

    return [
      {
        id: String(edge.id),
        points,
        endpointCaps: {
          start: true,
          end: true,
        },
        isSelected: false,
      },
    ];
  });
}, [edges, nodes, nodeMap]);

  const visiblePixiEdges = useMemo(() => {
    if (!currentNodeId) {
      return [];
    }

    return pixiEdges.flatMap((edge) => {
      const backendEdge = edges.find((item) => String(item.id) === edge.id);

      if (!backendEdge) {
        return [];
      }

      const sourceId = String(backendEdge.source);
      const targetId = String(backendEdge.target);

      const sourceVisited = visitedNodeIds.has(sourceId);
      const targetVisited = visitedNodeIds.has(targetId);

      const sourceIsCurrent = sourceId === currentNodeId;

      const targetIsCurrent = targetId === currentNodeId;

      /*
       * ------------------------------------------------------------
       * CASE 1
       * Both endpoints have already been visited.
       *
       * This road is permanently discovered.
       * ------------------------------------------------------------
       */
      if (sourceVisited && targetVisited) {
        return [
          {
            ...edge,
            endpointCaps: {
              start: true,
              end: true,
            },
          },
        ];
      }

      /*
       * ------------------------------------------------------------
       * CASE 2
       * This is an unexplored road connected to the current node.
       *
       * Only reveal the first part of it.
       * ------------------------------------------------------------
       */

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
            endpointCaps: {
              start: true,
              end: false,
            },
          },
        ];
      }

      /*
       * The Pixi route may have the opposite direction.
       * Reverse it when the current node is the target.
       */
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
            endpointCaps: {
              start: false,
              end: true,
            },
          },
        ];
      }

      /*
       * ------------------------------------------------------------
       * CASE 3
       *
       * Edge has not been discovered yet and isn't connected to
       * the current node.
       *
       * Completely hidden.
       * ------------------------------------------------------------
       */

      return [];
    });
  }, [pixiEdges, edges, visitedNodeIds, currentNodeId]);

  const fogRevealNodes = useMemo(() => {
    return nodes
      .filter((node) => visibleNodeIds.has(String(node.id)))
      .map((node) => {
        const position = worldToScreen(
          {
            x: node.position.x,
            y: node.position.y,
          },
          camera,
        );

        return {
          id: String(node.id),
          x: position.x,
          y: position.y,
          radius: FOG_NODE_REVEAL_RADIUS * camera.zoom,
        };
      });
  }, [nodes, visibleNodeIds, camera]);

  const fogRevealPaths = useMemo(() => {
    return visiblePixiEdges.map((edge) => {
      const points = edge.points.map((point) =>
        worldToScreen(point, camera),
      );

      return {
        id: edge.id,
        points,
        strokeWidth: FOG_PATH_REVEAL_WIDTH * camera.zoom,
      };
    });
  }, [visiblePixiEdges, camera]);


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
          backgroundImage: "url(/grass-tile.png)",
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
        {/* WORLD                                                            */}
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
    {/* Everything starts hidden by the fog */}
    <rect x="0" y="0" width="100%" height="100%" fill="white" />

    {/* All reveal shapes are blurred together, once */}
    <g filter="url(#map-fog-blur)">
      {fogRevealNodes.map((node) => (
        <circle
          key={`fog-node-${node.id}`}
          cx={node.x}
          cy={node.y}
          r={node.radius}
          fill="black"
        />
      ))}

      {fogRevealPaths.map((edge) => (
        <polyline
          key={`fog-road-${edge.id}`}
          points={edge.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="black"
          strokeWidth={edge.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  </mask>
</defs>

  {/* -------------------------------------------------------------- */}
  {/* DARK FOG                                                       */}
  {/* -------------------------------------------------------------- */}

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
            transform: `
      translate(${camera.x}px, ${camera.y}px)
      scale(${camera.zoom})
    `,
          }}
        >
          <div className="absolute left-0 top-0 h-px w-px">
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
                    handleNodeClick(node);
                  }}
                  className={[
                    "absolute box-border",
                    "flex items-center justify-center",
                    "text-center",
                    "select-none",
                    "transition-all duration-150",
                    isJunction ? "rounded-full p-2.5" : "rounded-[10px] p-3.5",

                    isCurrent
                      ? "border border-white bg-[#26313b] shadow-[0_0_25px_rgba(255,255,255,0.15)]"
                      : isVisited
                        ? "border border-white/30 bg-[#151c24]"
                        : "border border-white/10 bg-[#111820]",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: position.x,
                    top: position.y,
                    width: dimensions.width,
                    height: dimensions.height,
                  }}
                >
                  {isJunction ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                      <span className="text-xl leading-none opacity-80">✦</span>

                      <span className="text-[11px] leading-tight text-white/80">
                        {node.id}
                      </span>
                    </div>
                  ) : (
                    <>
                      {isVisited ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-[10px] text-white/40">
                            #{node.id}
                          </span>

                          <span className="text-[13px] leading-tight text-white">
                            {node.id}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="text-lg text-white/30">?</span>

                          <span className="text-[9px] uppercase tracking-widest text-white/30">
                            Unknown
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
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
