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

/* -------------------------------------------------------------------------- */
/*                              MAP CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

const JUNCTION_SIZE = 92;

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

const ZOOM_STEP = 0.1;

const FIT_PADDING = 100;

const CURRENT_NODE_REVEAL_DISTANCE = 580;
const FOG_NODE_REVEAL_RADIUS = 180;
const FOG_PATH_REVEAL_WIDTH = 150;
const FOG_BLUR_RADIUS = 14;

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

  let remaining = distance;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    const segmentLength = getDistance(start, end);

    if (segmentLength === 0) {
      continue;
    }

    if (remaining >= segmentLength) {
      result.push({
        x: end.x,
        y: end.y,
      });

      remaining -= segmentLength;
      continue;
    }

    const ratio = remaining / segmentLength;

    result.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    });

    break;
  }

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
  console.log(visitedNodesData);

  const {
    data: mapSkeleton,
    // isError: isMapLoadError,
    // isPending: isMapLoading,
  } = useGetMapSkeleton();

  const nodes = useMemo(() => mapSkeleton?.nodes || [], [mapSkeleton]);
  const edges = useMemo(() => mapSkeleton?.edges || [], [mapSkeleton]);

  const visitedNodeIds = useMemo(
    () => new Set(visitedNodesData?.visited_nodes ?? []),
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


  function createOrthogonalRoute(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const midpointX = Math.round((from.x + to.x) / 2);

    return [
      {
        x: from.x,
        y: from.y,
      },
      {
        x: midpointX,
        y: from.y,
      },
      {
        x: midpointX,
        y: to.y,
      },
      {
        x: to.x,
        y: to.y,
      },
    ];
  }

  const pixiEdges = useMemo(() => {
    return edges.flatMap((edge) => {
      const from = nodeMap.get(edge.source);
      const to = nodeMap.get(edge.target);

      if (!from || !to) {
        return [];
      }

      return [
        {
          id: String(edge.id),

          points: createOrthogonalRoute(from.position, to.position),

          endpointCaps: {
            start: true,
            end: true,
          },

          isSelected: false,
        },
      ];
    });
  }, [edges, nodeMap]);

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

      const sourceVisited = visitedNodeIds.has(Number(sourceId));

      const targetVisited = visitedNodeIds.has(Number(targetId));

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
          "bg-[#0b0f14]",
          "cursor-grab",
          isPanning ? "cursor-grabbing" : "",
        ].join(" ")}
        style={{
          backgroundImage: `
            linear-gradient(
              rgba(255,255,255,0.025) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(255,255,255,0.025) 1px,
              transparent 1px
            )
          `,
          backgroundSize: "40px 40px",
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
  className="pointer-events-none absolute inset-0 z-10 h-full w-full"
>
  <defs>
    <filter
      id="map-fog-blur"
      x="-20%"
      y="-20%"
      width="140%"
      height="140%"
    >
      <feGaussianBlur stdDeviation={FOG_BLUR_RADIUS} />
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
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="white"
      />

      {/* ------------------------------------------------------------ */}
      {/* NODE REVEAL AREAS                                            */}
      {/* ------------------------------------------------------------ */}

      {fogRevealNodes.map((node) => (
        <circle
          key={`fog-node-${node.id}`}
          cx={node.x}
          cy={node.y}
          r={node.radius}
          fill="black"
          filter="url(#map-fog-blur)"
        />
      ))}

      {/* ------------------------------------------------------------ */}
      {/* ROAD REVEAL AREAS                                            */}
      {/* ------------------------------------------------------------ */}

      {fogRevealPaths.map((edge) => (
        <polyline
          key={`fog-road-${edge.id}`}
          points={edge.points
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke="black"
          strokeWidth={edge.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#map-fog-blur)"
        />
      ))}
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
    fill="rgba(2, 5, 8, 0.94)"
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

              const isVisited = visitedNodeIds.has(Number(nodeId));

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

        {/* ================================================================ */}
        {/* EMPTY MAP                                                        */}
        {/* ================================================================ */}

        {nodes.length === 0 && (
          <div className="select-none pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/40">
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
