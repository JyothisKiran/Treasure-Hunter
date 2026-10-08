import {
  useEffect,
  type MouseEvent as ReactMouseEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { toast } from "@/components/ui/8bit/toast";
import {
  MAP_MAKER_MAPS_QUERY_KEY,
  useMapMakerMaps,
} from "@/hooks/queries/useMapMakerMaps";
import { mapService } from "@/services/map.service";
import {
  PixiRoadLayer,
  type PixiRoadEdge,
} from "@/components/map-maker/PixiRoadLayer";
// import {
//   findLoops,
//   getLoopLayout,
// } from "@/components/map-maker/loopLayout";
import type {
  BackendMap,
  BackendMapNode,
  CreateMapNodeRequest,
  CreateMapNodeResponse,
  MapNode,
  MapNodeType,
  RemoveNodeRelationRequest,
  SetNodeRelationRequest,
  TreasureMap,
  UpdateMapNodeRequest,
} from "@/types/map";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 132;
const NODE_HALF_WIDTH = NODE_WIDTH / 2;
const NODE_HALF_HEIGHT = NODE_HEIGHT / 2;
const ALIGNMENT_EPSILON = 4;
const ROUTING_LANE_GAP = 32;
const MAP_GRID_SIZE = 16;
const PIXEL_ROAD_TILE_SIZE = MAP_GRID_SIZE;
const PIXEL_ROAD_HIT_WIDTH = 20;

/* ---------------------------- ZOOM / VIEW SETTINGS ---------------------------- */
const MAX_ZOOM = 2.5;
const DEFAULT_MIN_ZOOM = 0.35; // used for small maps (never higher than this)
const MIN_ZOOM_FLOOR = 0.02; // absolute lowest zoom, even for a huge map
const ZOOM_OUT_MARGIN = 0.75; // allow zooming out to 75% of "whole map fits"
const FIT_PADDING = 80; // empty space kept around the view, in screen px
const RESET_MAX_ZOOM = 1; // "Reset view" never zooms in past 100%
const RESET_FIT_RATIO = 0.8; // "Reset view" shows ~80% of the nodes around the centroid
const ZOOM_BUTTON_FACTOR = 1.25; // +/- buttons zoom by this factor per click

const DEFAULT_MAP: TreasureMap = {
  id: "treasure-map-1",
  name: "Untitled Expedition",
  nodes: [],
};
type DraftNode = { type: MapNodeType; question: string; answer: string };
type EdgeSelection = { sourceId: string; targetId: string };
type ContextMenuState = { nodeId: string; x: number; y: number };
type EdgeRouting = {
  sourcePortOffset: number;
  targetPortOffset: number;
  laneOffset: number;
};
type MapPoint = { x: number; y: number };
type RoadDirection = "up" | "right" | "down" | "left";
const EMPTY_DRAFT: DraftNode = { type: "NODE", question: "", answer: "" };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapToGrid(value: number) {
  return Math.round(value / MAP_GRID_SIZE) * MAP_GRID_SIZE;
}

function snapPointToGrid(point: MapPoint): MapPoint {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}

function isGridAligned(point: MapPoint) {
  return point.x % MAP_GRID_SIZE === 0 && point.y % MAP_GRID_SIZE === 0;
}

function nextPosition(index: number) {
  return snapPointToGrid({
    x: 180 + (index % 4) * 320,
    y: 160 + Math.floor(index / 4) * 240,
  });
}

/** Nodes that have a real, finite position. */
function getPlacedNodes(nodes: MapNode[]) {
  return nodes.filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
}

/**
 * Lowest zoom allowed for this map: the zoom at which the WHOLE map fits the
 * screen, times ZOOM_OUT_MARGIN. Small maps keep the old 35% limit; a map with
 * 100-150 nodes can zoom out much further (down to MIN_ZOOM_FLOOR).
 */
function getMinZoom(
  nodes: MapNode[],
  viewportWidth: number,
  viewportHeight: number,
) {
  const placed = getPlacedNodes(nodes);
  if (!placed.length || viewportWidth <= 0 || viewportHeight <= 0)
    return DEFAULT_MIN_ZOOM;
  const minX = Math.min(...placed.map((node) => node.x - NODE_HALF_WIDTH));
  const maxX = Math.max(...placed.map((node) => node.x + NODE_HALF_WIDTH));
  const minY = Math.min(...placed.map((node) => node.y - NODE_HALF_HEIGHT));
  const maxY = Math.max(...placed.map((node) => node.y + NODE_HALF_HEIGHT));
  const fitZoom = Math.min(
    (viewportWidth - FIT_PADDING * 2) / Math.max(maxX - minX, 1),
    (viewportHeight - FIT_PADDING * 2) / Math.max(maxY - minY, 1),
  );
  return clamp(fitZoom * ZOOM_OUT_MARGIN, MIN_ZOOM_FLOOR, DEFAULT_MIN_ZOOM);
}

function canAddChild(node: MapNode): boolean {
  const childLimit = node.type === "JUNCTION" ? 2 : 1;
  return node.children.length < childLimit;
}

function getPortOffset(index: number, count: number, maxOffset: number) {
  if (count < 2) return 0;
  return -maxOffset + (index / (count - 1)) * maxOffset * 2;
}

function getLaneOffset(index: number, count: number) {
  return (index - (count - 1) / 2) * ROUTING_LANE_GAP;
}

function getParallelEdges(
  nodes: MapNode[],
  sourceId: string,
  targetId: string,
) {
  return nodes
    .flatMap((source) =>
      source.children
        .filter(
          (childId) =>
            (source.id === sourceId && childId === targetId) ||
            (source.id === targetId && childId === sourceId),
        )
        .map((childId) => ({
          sourceId: source.id,
          targetId: childId,
        })),
    )
    .sort((first, second) => {
      const firstKey = `${first.sourceId}:${first.targetId}`;
      const secondKey = `${second.sourceId}:${second.targetId}`;
      return firstKey.localeCompare(secondKey);
    });
}

function getRouteOrientation(source: MapNode, target: MapNode) {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const isVerticallyAligned = Math.abs(deltaX) <= ALIGNMENT_EPSILON;
  const isHorizontallyAligned = Math.abs(deltaY) <= ALIGNMENT_EPSILON;
  return isVerticallyAligned ||
    (!isHorizontallyAligned && Math.abs(deltaY) >= Math.abs(deltaX))
    ? "vertical"
    : "horizontal";
}

function getEndpointSide(
  source: MapNode,
  target: MapNode,
  endpoint: "source" | "target",
): RoadDirection {
  const orientation = getRouteOrientation(source, target);
  if (orientation === "vertical") {
    const sourceSide = target.y >= source.y ? "down" : "up";
    return endpoint === "source" ? sourceSide : oppositeDirection(sourceSide);
  }
  const sourceSide = target.x >= source.x ? "right" : "left";
  return endpoint === "source" ? sourceSide : oppositeDirection(sourceSide);
}

type ConnectedEdge = {
  source: MapNode;
  target: MapNode;
  endpoint: "source" | "target";
};

function getSideConnections(
  nodes: MapNode[],
  node: MapNode,
  side: RoadDirection,
) {
  const connections: ConnectedEdge[] = [];
  nodes.forEach((source) => {
    source.children.forEach((childId) => {
      const target = nodes.find((candidate) => candidate.id === childId);
      if (!target) return;
      if (
        source.id === node.id &&
        getEndpointSide(source, target, "source") === side
      )
        connections.push({ source, target, endpoint: "source" });
      if (
        target.id === node.id &&
        getEndpointSide(source, target, "target") === side
      )
        connections.push({ source, target, endpoint: "target" });
    });
  });
  return connections.sort((first, second) => {
    const firstKey = `${first.source.id}:${first.target.id}:${first.endpoint}`;
    const secondKey = `${second.source.id}:${second.target.id}:${second.endpoint}`;
    return firstKey.localeCompare(secondKey);
  });
}

function getEdgeRouting(
  nodes: MapNode[],
  source: MapNode,
  target: MapNode,
): EdgeRouting {
  const sourceConnections = getSideConnections(
    nodes,
    source,
    getEndpointSide(source, target, "source"),
  );

  const targetConnections = getSideConnections(
    nodes,
    target,
    getEndpointSide(source, target, "target"),
  );

  const isCurrentSource = (edge: ConnectedEdge) =>
    edge.source.id === source.id &&
    edge.target.id === target.id &&
    edge.endpoint === "source";

  const isCurrentTarget = (edge: ConnectedEdge) =>
    edge.source.id === source.id &&
    edge.target.id === target.id &&
    edge.endpoint === "target";

  const sourceIndex = sourceConnections.findIndex(isCurrentSource);
  const targetIndex = targetConnections.findIndex(isCurrentTarget);

  const maxPortOffset = Math.min(
    NODE_HALF_WIDTH - 18,
    NODE_HALF_HEIGHT - 18,
  );

  const normalSourcePortOffset = getPortOffset(
    sourceIndex,
    sourceConnections.length,
    maxPortOffset,
  );

  const normalTargetPortOffset = getPortOffset(
    targetIndex,
    targetConnections.length,
    maxPortOffset,
  );

  /*
   * Treat A -> B and B -> A as parallel visual edges.
   *
   * Without this, each edge sees only one connection on its side and
   * therefore both receive port offset 0 and lane offset 0.
   */
  const parallelEdges = getParallelEdges(nodes, source.id, target.id);
  const parallelIndex = parallelEdges.findIndex(
    (edge) =>
      edge.sourceId === source.id && edge.targetId === target.id,
  );

  const hasParallelEdges = parallelEdges.length > 1;

  const parallelPortOffset = hasParallelEdges
    ? getPortOffset(
        parallelIndex,
        parallelEdges.length,
        Math.min(16, maxPortOffset),
      )
    : 0;

  const sourcePortOffset = hasParallelEdges
    ? parallelPortOffset
    : normalSourcePortOffset;

  const targetPortOffset = hasParallelEdges
    ? parallelPortOffset
    : normalTargetPortOffset;

  const normalLaneOffset =
    sourceConnections.length > 1
      ? getLaneOffset(sourceIndex, sourceConnections.length)
      : getLaneOffset(targetIndex, targetConnections.length);

  const laneOffset = hasParallelEdges
    ? getLaneOffset(parallelIndex, parallelEdges.length)
    : normalLaneOffset;

  return {
    sourcePortOffset,
    targetPortOffset,
    laneOffset,
  };
}

function normalizeRoutePoints(points: MapPoint[]) {
  return points.map(snapPointToGrid).filter((point, index, all) => {
    const previous = all[index - 1];
    return (
      isGridAligned(point) &&
      (!previous || previous.x !== point.x || previous.y !== point.y)
    );
  });
}

function getNodeConnectionPoints(
  source: MapNode,
  target: MapNode,
  routing: EdgeRouting,
): MapPoint[] {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;

  const isVerticallyAligned = Math.abs(deltaX) <= ALIGNMENT_EPSILON;
  const isHorizontallyAligned = Math.abs(deltaY) <= ALIGNMENT_EPSILON;
  const isVerticalRoute = getRouteOrientation(source, target) === "vertical";

  if (isVerticalRoute) {
    const direction = deltaY >= 0 ? 1 : -1;

    const sourceX = source.x + routing.sourcePortOffset;
    const targetX = target.x + routing.targetPortOffset;

    const sourceY = source.y + direction * NODE_HALF_HEIGHT;
    const targetY = target.y - direction * NODE_HALF_HEIGHT;

    if (
      isVerticallyAligned &&
      Math.abs(sourceX - targetX) <= ALIGNMENT_EPSILON &&
      Math.abs(routing.laneOffset) <= ALIGNMENT_EPSILON
    ) {
      return normalizeRoutePoints([
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
      ]);
    }

    const midpoint = (sourceY + targetY) / 2;

    const maxLaneOffset = Math.max(
      0,
      Math.abs(targetY - sourceY) / 2 - 12,
    );

    const bendY =
      midpoint +
      Math.max(
        -maxLaneOffset,
        Math.min(maxLaneOffset, routing.laneOffset),
      );

    return normalizeRoutePoints([
      { x: sourceX, y: sourceY },
      { x: sourceX, y: bendY },
      { x: targetX, y: bendY },
      { x: targetX, y: targetY },
    ]);
  }

  const direction = deltaX >= 0 ? 1 : -1;

  const sourceX = source.x + direction * NODE_HALF_WIDTH;
  const targetX = target.x - direction * NODE_HALF_WIDTH;

  const sourceY = source.y + routing.sourcePortOffset;
  const targetY = target.y + routing.targetPortOffset;

  if (
    isHorizontallyAligned &&
    Math.abs(sourceY - targetY) <= ALIGNMENT_EPSILON &&
    Math.abs(routing.laneOffset) <= ALIGNMENT_EPSILON
  ) {
    return normalizeRoutePoints([
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ]);
  }

  const midpoint = (sourceX + targetX) / 2;

  const maxLaneOffset = Math.max(
    0,
    Math.abs(targetX - sourceX) / 2 - 12,
  );

  const bendX =
    midpoint +
    Math.max(
      -maxLaneOffset,
      Math.min(maxLaneOffset, routing.laneOffset),
    );

  return normalizeRoutePoints([
    { x: sourceX, y: sourceY },
    { x: bendX, y: sourceY },
    { x: bendX, y: targetY },
    { x: targetX, y: targetY },
  ]);
}

function getRoadPath(points: MapPoint[]) {
  return points
    .map((point, index) => {
      const centerX = point.x + PIXEL_ROAD_TILE_SIZE / 2;
      const centerY = point.y + PIXEL_ROAD_TILE_SIZE / 2;
      return `${index ? "L" : "M"} ${centerX} ${centerY}`;
    })
    .join(" ");
}

function oppositeDirection(direction: RoadDirection): RoadDirection {
  if (direction === "up") return "down";
  if (direction === "down") return "up";
  if (direction === "left") return "right";
  return "left";
}

function getEndpointCaps(
  source: MapNode,
  target: MapNode,
): { start: boolean; end: boolean } {
  // An edge always enters/leaves a node, so a node-side road is normally open.
  // A target with no outgoing relation is the only true graph termination we can
  // derive from the persisted graph without inventing visual-only backend data.
  return {
    start: false,
    end: source.id !== target.id && target.children.length === 0,
  };
}

type MapRoadEdge = PixiRoadEdge & {
  sourceId: string;
  targetId: string;
  roadPath: string;
};

function getMapRoadEdges(
  nodes: MapNode[],
  selectedEdge: EdgeSelection | null,
): MapRoadEdge[] {
  return nodes.flatMap((source) =>
    source.children.flatMap((targetId) => {
      const target = nodes.find((node) => node.id === targetId);
      if (!target) return [];
      const points = getNodeConnectionPoints(
        source,
        target,
        getEdgeRouting(nodes, source, target),
      );
      if (points.length < 2) return [];
      return [
        {
          endpointCaps: getEndpointCaps(source, target),
          id: `${source.id}-${target.id}`,
          isSelected:
            selectedEdge?.sourceId === source.id &&
            selectedEdge.targetId === target.id,
          points,
          roadPath: getRoadPath(points),
          sourceId: source.id,
          targetId: target.id,
        },
      ];
    }),
  );
}

function getNodePlacementNearParent(parent: MapNode, siblingCount: number) {
  const offsetX = 260;
  const offsetY =
    (siblingCount % 2 === 0 ? 1 : -1) * (90 + (siblingCount % 3) * 45);

  return {
    x: parent.x + offsetX,
    y: parent.y + offsetY,
  };
}

function getBackendId(nodeId: string): number | null {
  const id = Number(nodeId);
  return Number.isSafeInteger(id) && id >= 0 && String(id) === nodeId
    ? id
    : null;
}

function unwrapCreatedNode(response: CreateMapNodeResponse): BackendMapNode {
  return "id" in response ? response : response.data;
}

function mapFromBackendMap(backendMap: BackendMap): TreasureMap {
  const nodeIds = new Set(backendMap.nodes.map((node) => node.id));
  const childrenByParent = new Map<number, Set<number>>(
    backendMap.nodes.map((node) => [
      node.id,
      new Set(node.children_ids.filter((childId) => nodeIds.has(childId))),
    ]),
  );
  const cycleNodeIds = new Set<number>();
  const addChild = (parentId: number | null, childId: number) => {
    if (parentId === null || !nodeIds.has(parentId) || !nodeIds.has(childId))
      return;
    childrenByParent.get(parentId)?.add(childId);
  };

  backendMap.nodes.forEach((node) => {
    addChild(node.parent_id, node.id);
    addChild(node.alt_parent_id, node.id);
    if (node.alt_child_id !== null) addChild(node.id, node.alt_child_id);
  });
  backendMap.edges.forEach((edge) => {
    addChild(edge.source, edge.target);
    if (edge.is_cycle) {
      cycleNodeIds.add(edge.source);
      cycleNodeIds.add(edge.target);
    }
  });

  const nodes = backendMap.nodes.map((node): MapNode => {
    const id = String(node.id);
    return {
      id,
      type: node.effects === "JUNCTION" ? "JUNCTION" : "NODE",
      x: node?.position?.x,
      y: node?.position?.y,
      question: node.data,
      answer: node.answer ?? undefined,
      children: [...(childrenByParent.get(node.id) ?? [])].map(String),
      isCycle: cycleNodeIds.has(node.id),
      metadata: {
        clue: node.clue,
        effects: node.effects,
        score: node.score,
        bonus: node.bonus,
        life: node.life,
        attack: node.attack,
        isNearest: node.is_nearest,
        parentId: node.parent_id,
        altParentId: node.alt_parent_id,
        altChildId: node.alt_child_id,
        level: node.level,
        status: node.status,
        isCurrent: node.is_current,
        isHead: node.is_head,
        isCheckpoint: node.is_checkpoint,
        createdAt: node.created_at,
        position: { x: node.x, y: node.y },
      },
    };
  });

  return {
    id: String(backendMap.team_state?.id ?? "server-map"),
    name: backendMap.team_state?.name ?? "Team Map",
    nodes: nodes,
  };
}

function mapFromBackendMaps(backendMaps: BackendMap): TreasureMap {
  return backendMaps.nodes.length
    ? mapFromBackendMap(backendMaps)
    : DEFAULT_MAP;
}

export default function MapMakerPage() {
  const [map, setMap] = useState<TreasureMap>(DEFAULT_MAP);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [parentNodeIdForNewChild, setParentNodeIdForNewChild] = useState<
    string | null
  >(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftNode>(EMPTY_DRAFT);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedEdge, setSelectedEdge] = useState<EdgeSelection | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const queryClient = useQueryClient();
  const {
    data: backendMaps,
    isError: isMapLoadError,
    isPending: isMapLoading,
  } = useMapMakerMaps();
  const createNodeMutation = useMutation<
    CreateMapNodeResponse,
    Error,
    CreateMapNodeRequest
  >({
    mutationFn: async (data) => (await mapService.createNode(data)).data,
  });
  const setRelationMutation = useMutation<void, Error, SetNodeRelationRequest>({
    mutationFn: async (data) => {
      await mapService.setRelation(data);
    },
  });
  const updateNodeMutation = useMutation<
    BackendMapNode,
    Error,
    { id: number; data: UpdateMapNodeRequest }
  >({
    mutationFn: async ({ id, data }) =>
      (await mapService.updateNode(id, data)).data,
  });
  const removeRelationMutation = useMutation<
    void,
    Error,
    RemoveNodeRelationRequest
  >({
    mutationFn: async (data) => {
      await mapService.removeRelation(data);
    },
  });
  const deleteNodeMutation = useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await mapService.deleteNode(id);
    },
  });
  const clearMapMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      await mapService.clearMap();
    },
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: "pan" | "node";
    id?: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const edgePointerRef = useRef<{
    id: number;
    moved: boolean;
    sourceId: string;
    targetId: string;
  } | null>(null);
  // "LOOP" label: nodes that are part of a loop (found by findLoops) plus any
  // the server already flagged as cycle nodes.
  // const cycleNodes = new Set([
  //   ...findLoops(map.nodes).flat(),
  //   ...map.nodes.filter((node) => node.isCycle).map((node) => node.id),
  // ]);
  const roadEdges = getMapRoadEdges(map.nodes, selectedEdge);

  useEffect(() => {
    if (!backendMaps) return;

    const syncMap = window.setTimeout(() => {
      setMap((current) => {
        const syncedMap = mapFromBackendMaps(backendMaps);
        return {
          ...syncedMap,
          name: current.name || syncedMap.name,
        };
      });

      setSelectedNodeId(null);
      setSelectedEdge(null);
      setConnectionSourceId(null);
    }, 0);

    return () => window.clearTimeout(syncMap);
  }, [backendMaps]);
  useEffect(() => {
    if (isMapLoadError)
      toast("Could not load the server map; using the local editor map");
  }, [isMapLoadError]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /** Lowest zoom for the current map size and screen size. */
  const getCurrentMinZoom = () => {
    const viewport = viewportRef.current;
    return getMinZoom(
      map.nodes,
      viewport?.clientWidth ?? 0,
      viewport?.clientHeight ?? 0,
    );
  };

  const setZoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const boundedZoom = clamp(nextZoom, getCurrentMinZoom(), MAX_ZOOM);
    if (
      clientX === undefined ||
      clientY === undefined ||
      !viewportRef.current
    ) {
      setZoom(boundedZoom);
      return;
    }
    const bounds = viewportRef.current.getBoundingClientRect();
    const factor = boundedZoom / zoom;
    setPan((current) => ({
      x: clientX - bounds.left - (clientX - bounds.left - current.x) * factor,
      y: clientY - bounds.top - (clientY - bounds.top - current.y) * factor,
    }));
    setZoom(boundedZoom);
  };

  /** Zoom buttons: multiply the zoom and keep the screen centre fixed. */
  const zoomByFactor = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoomAt(zoom * factor);
      return;
    }
    const bounds = viewport.getBoundingClientRect();
    setZoomAt(
      zoom * factor,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
  };

  const beginCanvasInteraction = (event: ReactPointerEvent<Element>) => {
    setSelectedNodeId(null);
    setSelectedEdge(null);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y,
        ),
        zoom,
      };
      dragRef.current = null;
      return;
    }
    viewportRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
  };

  const handleCanvasPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    setContextMenu(null);
    if (event.target !== event.currentTarget) return;
    beginCanvasInteraction(event);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointersRef.current.has(event.pointerId))
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      setZoomAt(
        pinchRef.current.zoom *
          (Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) /
            pinchRef.current.distance),
        (points[0].x + points[1].x) / 2,
        (points[0].y + points[1].y) / 2,
      );
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) drag.moved = true;
    if (edgePointerRef.current?.id === event.pointerId && drag.moved)
      edgePointerRef.current.moved = true;
    if (drag.kind === "pan")
      setPan({ x: drag.originX + deltaX, y: drag.originY + deltaY });
    else if (drag.id)
      updateNode(drag.id, {
        x: drag.originX + deltaX / zoom,
        y: drag.originY + deltaY / zoom,
      });
  };

  const finishCanvasPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const edgePointer = edgePointerRef.current;
    if (
      event.type !== "pointercancel" &&
      edgePointer?.id === event.pointerId &&
      !edgePointer.moved
    ) {
      setContextMenu(null);
      setSelectedEdge({
        sourceId: edgePointer.sourceId,
        targetId: edgePointer.targetId,
      });
      setSelectedNodeId(null);
      edgePointerRef.current = null;
    }
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.kind === "pan" && dragRef.current.moved)
      setSelectedNodeId(null);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      setPan((current) => ({
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      }));
    } else {
      setZoomAt(
        zoom * Math.pow(0.998, event.deltaY),
        event.clientX,
        event.clientY,
      );
    }
  };

  const updateNode = (nodeId: string, update: Partial<MapNode>) => {
    setMap((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, ...update, ...snapPointToGrid({ ...node, ...update }) }
          : node,
      ),
    }));
  };

  const openAddDialog = (parentNodeId?: string | null) => {
    setEditingNodeId(null);
    setDraft(EMPTY_DRAFT);
    setParentNodeIdForNewChild(parentNodeId ?? null);
    setDialogOpen(true);
  };
  const openEditDialog = (node: MapNode) => {
    setEditingNodeId(node.id);
    setDraft({
      type: node.type,
      question: node.question ?? "",
      answer: node.answer ?? "",
    });
    setDialogOpen(true);
  };

  const updateNodeFromBackend = (nodeId: string, updated: BackendMapNode) => {
    setMap((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              type: updated.effects === "JUNCTION" ? "JUNCTION" : "NODE",
              question: updated.data,
              answer: updated.answer ?? undefined,
              metadata: {
                clue: updated.clue,
                effects: updated.effects,
                score: updated.score,
                bonus: updated.bonus,
                life: updated.life,
                attack: updated.attack,
                isNearest: updated.is_nearest,
                parentId: updated.parent_id,
                altParentId: updated.alt_parent_id,
                altChildId: updated.alt_child_id,
                level: updated.level,
                status: updated.status,
                isCurrent: updated.is_current,
                isHead: updated.is_head,
                isCheckpoint: updated.is_checkpoint,
                createdAt: updated.created_at,
              },
            }
          : node,
      ),
    }));
  };

  const saveDraft = async () => {
    if (
      draft.type === "NODE" &&
      (!draft.question.trim() || !draft.answer.trim())
    ) {
      toast("Nodes need a question and answer");
      return;
    }
    if (editingNodeId) {
      const backendId = getBackendId(editingNodeId);
      if (backendId === null) {
        toast("Only server-backed nodes can be edited");
        return;
      }
      try {
        const updated = await updateNodeMutation.mutateAsync({
          id: backendId,
          data: {
            data: draft.type === "NODE" ? draft.question.trim() : "JUNCTION",
            answer: draft.type === "NODE" ? draft.answer.trim() : "",
            effects: draft.type === "JUNCTION" ? "JUNCTION" : "UNLOCKED",
          },
        });
        updateNodeFromBackend(editingNodeId, updated);
        setSelectedNodeId(editingNodeId);
        setDialogOpen(false);
        void queryClient.invalidateQueries({
          queryKey: MAP_MAKER_MAPS_QUERY_KEY,
        });
        toast("Node updated");
      } catch {
        toast("Could not update the node. Your graph was not changed.");
      }
      return;
    } else {
      const parentNode = parentNodeIdForNewChild
        ? (map.nodes.find((node) => node.id === parentNodeIdForNewChild) ??
          null)
        : null;
      if (parentNode && !canAddChild(parentNode)) {
        toast("This node cannot accept another child");
        setParentNodeIdForNewChild(null);
        setDialogOpen(false);
        return;
      }

      const parentBackendId = parentNode ? getBackendId(parentNode.id) : null;

      if (parentNode && parentBackendId === null) {
        toast("This local-only parent cannot be used for a server node");
        return;
      }

      const basePosition = parentNode
        ? getNodePlacementNearParent(parentNode, parentNode.children.length)
        : nextPosition(map.nodes.length);

      const question = draft.question.trim();
      const answer = draft.answer.trim();

      try {
        unwrapCreatedNode(
          await createNodeMutation.mutateAsync({
            data: draft.type === "JUNCTION" ? "JUNCTION" : question,
            clue: draft.type === "JUNCTION" ? "" : question,
            answer: draft.type === "JUNCTION" ? "" : answer,
            effects: draft.type === "JUNCTION" ? "JUNCTION" : "UNLOCKED",
            parent: parentBackendId,
            position: basePosition,
          }),
        );
        setParentNodeIdForNewChild(null);
        setDialogOpen(false);
        void queryClient.invalidateQueries({
          queryKey: MAP_MAKER_MAPS_QUERY_KEY,
        });
        toast(
          parentNode
            ? `${draft.type} node added as child`
            : `${draft.type} node added`,
        );
      } catch {
        toast("Could not create the node. Your graph was not changed.");
      }
      return;
    }
  };

  const removeNodeLocally = (nodeId: string) => {
    setMap((current) => ({
      ...current,
      nodes: current.nodes
        .filter((node) => node.id !== nodeId)
        .map((node) => ({
          ...node,
          children: node.children.filter((child) => child !== nodeId),
        })),
    }));
    setSelectedNodeId((current) => (current === nodeId ? null : current));
    setSelectedEdge((current) =>
      current && (current.sourceId === nodeId || current.targetId === nodeId)
        ? null
        : current,
    );
    setConnectionSourceId((current) => (current === nodeId ? null : current));
    setParentNodeIdForNewChild((current) =>
      current === nodeId ? null : current,
    );
    setContextMenu(null);
  };

  const deleteNode = async (nodeId: string) => {
    const backendId = getBackendId(nodeId);
    if (backendId === null) {
      removeNodeLocally(nodeId);
      toast("Local-only node deleted");
      return;
    }
    try {
      await deleteNodeMutation.mutateAsync(backendId);
      removeNodeLocally(nodeId);
      void queryClient.invalidateQueries({
        queryKey: MAP_MAKER_MAPS_QUERY_KEY,
      });
      toast("Node deleted");
    } catch {
      toast("Could not delete the node. Your graph was not changed.");
    }
  };

  const deleteConnection = async () => {
    if (!selectedEdge) return;
    const sourceId = getBackendId(selectedEdge.sourceId);
    const targetId = getBackendId(selectedEdge.targetId);
    if (sourceId === null || targetId === null) {
      toast("Only server-backed connections can be removed");
      return;
    }
    try {
      await removeRelationMutation.mutateAsync({
        node1_id: sourceId,
        node2_id: targetId,
      });
      setMap((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === selectedEdge.sourceId
            ? {
                ...node,
                children: node.children.filter(
                  (childId) => childId !== selectedEdge.targetId,
                ),
              }
            : node,
        ),
      }));
      setSelectedEdge(null);
      void queryClient.invalidateQueries({
        queryKey: MAP_MAKER_MAPS_QUERY_KEY,
      });
      toast("Connection removed");
    } catch {
      toast("Could not remove the connection. Your graph was not changed.");
    }
  };

  /**
   * Arrange loops in a circle. `focusNodeId` limits it to the loop containing
   * that node; without it every loop is arranged. New positions are applied
   * locally AND saved to the server (otherwise the refetch would undo them).
   * Returns true when something moved.
   */
  // const applyLoopLayout = async (nodes: MapNode[], focusNodeId?: string) => {
  //   const positions = getLoopLayout(nodes, focusNodeId);
  //   if (positions.size === 0) return false;

  //   setMap((current) => ({
  //     ...current,
  //     nodes: current.nodes.map((node) => {
  //       const position = positions.get(node.id);
  //       return position ? { ...node, ...position } : node;
  //     }),
  //   }));

  //   const results = await Promise.allSettled(
  //     [...positions].map(([nodeId, position]) => {
  //       const backendId = getBackendId(nodeId);
  //       return backendId === null
  //         ? Promise.resolve()
  //         : mapService.updateNode(backendId, { position });
  //     }),
  //   );
  //   if (results.some((result) => result.status === "rejected"))
  //     toast("Some node positions could not be saved");
  //   return true;
  // };

  // const arrangeLoops = async () => {
  //   const moved = await applyLoopLayout(map.nodes);
  //   // toast(moved ? "Loops arranged" : "No loops to arrange");
  // };

  const connectNodes = async (targetId: string) => {
    if (!connectionSourceId) return;
    const source = map.nodes.find((node) => node.id === connectionSourceId);
    const target = map.nodes.find((node) => node.id === targetId);
    if (!source || !target || source.children.includes(targetId)) {
      toast("That connection already exists");
      setConnectionSourceId(null);
      return;
    }
    if (source.id === target.id) {
      toast("A node cannot connect to itself");
      setConnectionSourceId(null);
      return;
    }
    if (!canAddChild(source)) {
      toast(`${source.type} nodes have reached their child limit`);
      setConnectionSourceId(null);
      return;
    }
    const sourceBackendId = getBackendId(source.id);
    const targetBackendId = getBackendId(target.id);
    if (sourceBackendId === null || targetBackendId === null) {
      toast("Only server-backed nodes can be connected");
      setConnectionSourceId(null);
      return;
    }
    try {
      await setRelationMutation.mutateAsync({
        parent_id: sourceBackendId,
        child_id: targetBackendId,
      });
      setMap((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === connectionSourceId
            ? { ...node, children: [...node.children, targetId] }
            : node,
        ),
      }));

      // If this new link closed a loop, snap that loop into a circle.
      // const nodesAfterLink = map.nodes.map((node) =>
      //   node.id === source.id
      //     ? { ...node, children: [...node.children, targetId] }
      //     : node,
      // );
      // const loopsBefore = findLoops(map.nodes);
      // const loopsAfter = findLoops(nodesAfterLink);

      // const createdLoop =
      //   loopsAfter.length > loopsBefore.length;

      // const loopArranged = createdLoop
      //   ? await applyLoopLayout(nodesAfterLink, source.id)
      //   : false;

      void queryClient.invalidateQueries({
        queryKey: MAP_MAKER_MAPS_QUERY_KEY,
      });
      // toast(
      //   loopArranged
      //     ? "Nodes connected, loop arranged"
      //     : "Nodes connected",
      // );
    } catch {
      toast("Could not create that connection. Your graph was not changed.");
    } finally {
      setConnectionSourceId(null);
    }
  };

  const startConnection = (nodeId: string) => {
    if (setRelationMutation.isPending) return;
    setConnectionSourceId(nodeId);
    setSelectedNodeId(nodeId);
    setSelectedEdge(null);
    setContextMenu(null);
    toast("Select an existing node to connect");
  };

  const openNodeContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    nodeId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const menuWidth = 152;
    const menuHeight = 48;
    setContextMenu({
      nodeId,
      x: Math.min(
        Math.max(8, event.clientX - bounds.left),
        bounds.width - menuWidth - 8,
      ),
      y: Math.min(
        Math.max(8, event.clientY - bounds.top),
        bounds.height - menuHeight - 8,
      ),
    });
    setSelectedNodeId(nodeId);
    setSelectedEdge(null);
  };

  const handleDeleteModalConfirmation = async () => {
    try {
      await clearMapMutation.mutateAsync();
      void queryClient.invalidateQueries({
        queryKey: MAP_MAKER_MAPS_QUERY_KEY,
      });
      setMap(DEFAULT_MAP);
      setSelectedNodeId(null);
      setSelectedEdge(null);
      setConnectionSourceId(null);
      setDeleteConfirmationOpen(false);
      toast("Map cleared");
    } catch (error) {
      toast("Error Occured! Could not clear the map.");
      console.error("Error clearing the map:", error);
    }
  };

  const resetMap = async () => {
    setDeleteConfirmationOpen(true);
  };

  /**
   * RESET VIEW: jump to the centroid (average position) of all nodes and
   * junctions, at a zoom where ~80% of the nodes nearest the centroid are
   * visible. Far-away outliers don't force the view to zoom way out.
   */
  const resetView = () => {
    const viewport = viewportRef.current;
    const placed = getPlacedNodes(map.nodes);
    if (!viewport || !placed.length) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;

    const centroidX = placed.reduce((sum, node) => sum + node.x, 0) / placed.length;
    const centroidY = placed.reduce((sum, node) => sum + node.y, 0) / placed.length;

    // For every node: how much zoom-out is needed to fit it around the centroid.
    const halfWidth = Math.max(viewportWidth / 2 - FIT_PADDING, 1);
    const halfHeight = Math.max(viewportHeight / 2 - FIT_PADDING, 1);
    const ratios = placed
      .map((node) =>
        Math.max(
          (Math.abs(node.x - centroidX) + NODE_HALF_WIDTH) / halfWidth,
          (Math.abs(node.y - centroidY) + NODE_HALF_HEIGHT) / halfHeight,
        ),
      )
      .sort((a, b) => a - b);
    const fitRatio =
      ratios[Math.min(ratios.length - 1, Math.ceil(ratios.length * RESET_FIT_RATIO) - 1)];

    const nextZoom = clamp(
      1 / fitRatio,
      getMinZoom(map.nodes, viewportWidth, viewportHeight),
      RESET_MAX_ZOOM,
    );
    setZoom(nextZoom);
    setPan({
      x: viewportWidth / 2 - centroidX * nextZoom,
      y: viewportHeight / 2 - centroidY * nextZoom,
    });
  };

  // The 32px background grid turns into a solid smear when zoomed far out.
  const gridSize = 32 * zoom;
  const showGrid = gridSize >= 6;

  return (
    <main className="map-maker-workspace retro flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-950/90 text-left text-xs text-slate-100">
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 bg-slate-950/95 px-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="py-2 flex w-full shrink-0 flex-wrap items-center justify-between gap-3">
            <Input
              aria-label="Map name"
              className="min-w-0 max-w-full flex-1 sm:max-w-sm"
              onChange={(event) =>
                setMap((current) => ({ ...current, name: event.target.value }))
              }
              size="compact"
              value={map.name}
            />
            {map.nodes.length > 0 && (
              <button
                aria-label="Add node"
                className="flex size-9 items-center justify-center border-2 border-emerald-300 bg-slate-950/90 text-emerald-200"
                onClick={() => openAddDialog(null)}
                title="Add node"
                type="button"
              >
                <Plus className="size-4" />
              </button>
            )}
          </div>
        </header>

        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col border-y-4 bg-slate-900 shadow-[6px_6px_0_rgba(8,145,178,0.25)]"
          aria-label="Map canvas"
        >
          <div
            className="relative flex h-full flex-col min-h-0 w-full flex-1 overflow-hidden border-2 border-dashed border-cyan-700 bg-slate-950"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={finishCanvasPointer}
            onPointerCancel={finishCanvasPointer}
            onWheel={handleCanvasWheel}
            ref={viewportRef}
            style={{
              backgroundImage: showGrid
                ? "linear-gradient(rgba(34,211,238,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.09) 1px, transparent 1px)"
                : "none",
              backgroundPosition: `${pan.x % gridSize}px ${pan.y % gridSize}px`,
              backgroundSize: `${gridSize}px ${gridSize}px`,
              touchAction: "none",
            }}
          >
            <PixiRoadLayer edges={roadEdges} pan={pan} zoom={zoom} />
            <div
              className="absolute left-0 top-0 h-px w-px origin-top-left"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <svg
                className="absolute left-0 top-0 size-px overflow-visible"
                aria-label="Map connection hit areas"
              >
                {roadEdges.map((edge) => (
                  <path
                    d={edge.roadPath}
                    fill="none"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (edgePointerRef.current?.moved) {
                        edgePointerRef.current = null;
                        return;
                      }
                      edgePointerRef.current = null;
                      setContextMenu(null);
                      setSelectedEdge({
                        sourceId: edge.sourceId,
                        targetId: edge.targetId,
                      });
                      setSelectedNodeId(null);
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setContextMenu(null);
                      edgePointerRef.current = {
                        id: event.pointerId,
                        moved: false,
                        sourceId: edge.sourceId,
                        targetId: edge.targetId,
                      };
                      beginCanvasInteraction(event);
                    }}
                    stroke="transparent"
                    // Keep roads clickable when zoomed far out (>= ~10 screen px).
                    strokeWidth={Math.max(PIXEL_ROAD_HIT_WIDTH, 10 / zoom)}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    key={edge.id}
                  />
                ))}
              </svg>
              {map.nodes.map((node) => {
                const isSelected = node.id === selectedNodeId;
                const isSource = node.id === connectionSourceId;
                const isHovered = hoveredNodeId === node.id;
                const showConnectionActions = isHovered && canAddChild(node);
                return (
                  <div
                    className="select-none absolute -translate-x-1/2 -translate-y-1/2"
                    key={node.id}
                    style={{ left: node.x, top: node.y }}
                  >
                    <article
                      className={`relative w-55 border-4 ${node.type === "JUNCTION" ? "border-fuchsia-300 bg-fuchsia-950 text-fuchsia-100" : "border-emerald-300 bg-emerald-950 text-emerald-100"} ${isSelected ? "z-10 ring-4 ring-amber-300" : ""} ${isSource ? "ring-4 ring-cyan-300" : ""}`}
                      onContextMenu={(event) =>
                        openNodeContextMenu(event, node.id)
                      }
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        openEditDialog(node);
                      }}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() =>
                        setHoveredNodeId((current) =>
                          current === node.id ? null : current,
                        )
                      }
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedEdge(null);
                        if (connectionSourceId) {
                          connectNodes(node.id);
                          return;
                        }
                        setSelectedNodeId(node.id);
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragRef.current = {
                          kind: "node",
                          id: node.id,
                          startX: event.clientX,
                          startY: event.clientY,
                          originX: node.x,
                          originY: node.y,
                          moved: false,
                        };
                      }}
                      onPointerMove={(event) => {
                        event.stopPropagation();
                        const drag = dragRef.current;
                        if (
                          !drag ||
                          drag.kind !== "node" ||
                          drag.id !== node.id
                        )
                          return;
                        const deltaX = event.clientX - drag.startX;
                        const deltaY = event.clientY - drag.startY;
                        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)
                          drag.moved = true;
                        if (drag.moved) {
                          updateNode(drag.id, {
                            x: drag.originX + deltaX / zoom,
                            y: drag.originY + deltaY / zoom,
                          });
                        }
                      }}
                      onPointerUp={async (event) => {
                        event.stopPropagation();
                        const drag = dragRef.current;
                        if (
                          drag &&
                          drag.kind === "node" &&
                          drag.id === node.id
                        ) {
                          if (drag.moved) {
                            setSelectedNodeId(node.id);
                          }
                          if (
                            drag.originX !== node.x ||
                            drag.originY !== node.y
                          ) {
                            try {
                              await updateNodeMutation.mutateAsync({
                                id: Number(node.id),
                                data: {
                                  position: {
                                    x: node.x,
                                    y: node.y,
                                  },
                                },
                              });
                            } catch (error) {
                              console.error("An error occured", error);
                              toast(
                                "Could not update the node position. Your graph was not changed.",
                              );
                            }
                          }
                          dragRef.current = null;
                          if (
                            event.currentTarget.hasPointerCapture(
                              event.pointerId,
                            )
                          ) {
                            event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );
                          }
                        }
                      }}
                      onPointerCancel={(event) => {
                        event.stopPropagation();
                        if (
                          event.currentTarget.hasPointerCapture(event.pointerId)
                        ) {
                          event.currentTarget.releasePointerCapture(
                            event.pointerId,
                          );
                        }
                        dragRef.current = null;
                      }}
                      style={{ height: NODE_HEIGHT, width: NODE_WIDTH }}
                    >
                      <div className="p-3">
                        <div className="block w-full text-left">
                          <span className="block text-[8px] text-amber-300">
                            {node.type}
                            {/* {cycleNodes.has(node.id) && " / LOOP"} */}
                          </span>
                          <span className="mt-1 block truncate text-[10px]">
                            {node.question || node.id}
                          </span>
                          <span className="mt-1 block text-[8px] text-slate-300">
                            {node.children.length}/
                            {node.type === "JUNCTION" ? 2 : 1} CHILDREN
                          </span>
                        </div>
                        {showConnectionActions && (
                          <button
                            aria-label={`Add child to ${node.type} ${node.id}`}
                            className="absolute -right-3 -top-3 z-20 flex size-7 items-center justify-center border-2 border-amber-300 bg-slate-950 text-lg leading-none text-amber-200 shadow-[2px_2px_0_rgba(0,0,0,0.45)] hover:bg-amber-950"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openAddDialog(node.id);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            type="button"
                          >
                            +
                          </button>
                        )}
                        {showConnectionActions && (
                          <button
                            aria-label={`Connect ${node.type} ${node.id} to an existing node`}
                            className="absolute -bottom-3 -right-3 z-20 border-2 border-cyan-300 bg-slate-950 px-1.5 py-1 text-[7px] leading-none text-cyan-100 shadow-[2px_2px_0_rgba(0,0,0,0.45)] hover:bg-cyan-950"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              startConnection(node.id);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            title="Connect to existing node"
                            type="button"
                          >
                            LINK
                          </button>
                        )}
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
            {contextMenu && (
              <div
                aria-label="Node actions"
                className="absolute z-50 min-w-38 border-3 border-amber-300 bg-slate-950 p-1 shadow-[4px_4px_0_rgba(0,0,0,0.55)]"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                role="menu"
                style={{ left: contextMenu.x, top: contextMenu.y }}
              >
                <button
                  className="flex w-full items-center gap-2 border-2 border-transparent px-2 py-1.5 text-left text-[9px] text-red-200 hover:border-red-300 hover:bg-red-950"
                  disabled={deleteNodeMutation.isPending}
                  onClick={() => void deleteNode(contextMenu.nodeId)}
                  role="menuitem"
                  type="button"
                >
                  <Trash2 className="size-3" />
                  {deleteNodeMutation.isPending ? "DELETING..." : "DELETE"}
                </button>
              </div>
            )}
            {!map.nodes.length && (
              <button
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-cyan-200"
                onClick={() => openAddDialog(null)}
                type="button"
              >
                <span className="flex size-12 items-center justify-center border-4 border-cyan-300 text-3xl">
                  +
                </span>
                <span className="text-[9px]">ADD A NODE TO BEGIN</span>
              </button>
            )}
            <div className="select-none absolute right-3 top-3 flex items-center gap-1.5 border-2 border-cyan-600 bg-slate-950/90 p-1.5">
              <button
                aria-label="Zoom out"
                className="flex size-7 items-center justify-center border border-cyan-400 text-cyan-200"
                onClick={() => zoomByFactor(1 / ZOOM_BUTTON_FACTOR)}
                type="button"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-11 text-center text-[8px] text-cyan-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                aria-label="Zoom in"
                className="flex size-7 items-center justify-center border border-cyan-400 text-cyan-200"
                onClick={() => zoomByFactor(ZOOM_BUTTON_FACTOR)}
                type="button"
              >
                <Plus className="size-3.5" />
              </button>
              <button
                className="border border-amber-400 px-1.5 py-1 text-[7px] text-amber-200"
                onClick={resetView}
                type="button"
              >
                RESET VIEW
              </button>
            </div>
            <div className="select-none mt-auto mb-3 px-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-400">
              <span className="text-[9px] text-cyan-200">
                {map.nodes.length} NODES /{" "}
                {map.nodes.reduce(
                  (count, node) => count + node.children.length,
                  0,
                )}{" "}
                LINKS
                {isMapLoading && " / SYNCING"}
              </span>
              <div className="flex items-center gap-3">
                {selectedEdge && (
                  <Button
                    disabled={removeRelationMutation.isPending}
                    onClick={() => void deleteConnection()}
                    size="compact"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="size-3" />
                    {removeRelationMutation.isPending
                      ? "REMOVING..."
                      : "REMOVE LINK"}
                  </Button>
                )}
                {/* <Button
                  onClick={() => void arrangeLoops()}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  ARRANGE LOOPS
                </Button> */}
                <Button
                  onClick={resetMap}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw className="size-3" /> CLEAR
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Node Editing Dialog */}
      {dialogOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg border-4 border-amber-400 bg-slate-900 p-4 shadow-[8px_8px_0_rgba(251,191,36,0.25)] sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="m-0 text-base text-amber-100">
                {editingNodeId ? "EDIT NODE" : "ADD NODE"}
              </h2>
              <button
                aria-label="Close dialog"
                className="text-amber-300"
                onClick={() => {
                  setParentNodeIdForNewChild(null);
                  setDialogOpen(false);
                }}
                type="button"
              >
                <X />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="draft-type">NODE TYPE</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    className={`min-h-10 border-3 p-1.5 text-[9px] ${draft.type === "NODE" ? "border-emerald-300 bg-emerald-950" : "border-slate-600 bg-slate-950"}`}
                    onClick={() =>
                      setDraft((current) => ({ ...current, type: "NODE" }))
                    }
                    type="button"
                  >
                    NODE
                  </button>
                  <button
                    className={`min-h-10 border-3 p-1.5 text-[9px] ${draft.type === "JUNCTION" ? "border-fuchsia-300 bg-fuchsia-950" : "border-slate-600 bg-slate-950"}`}
                    onClick={() =>
                      setDraft((current) => ({ ...current, type: "JUNCTION" }))
                    }
                    type="button"
                  >
                    JUNCTION
                  </button>
                </div>
              </div>
              {draft.type === "NODE" && (
                <>
                  <div>
                    <Label htmlFor="draft-question">QUESTION</Label>
                    <textarea
                      className="mt-2 min-h-20 w-full border-3 border-slate-600 bg-slate-950 p-2 text-[11px]"
                      id="draft-question"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          question: event.target.value,
                        }))
                      }
                      placeholder="Enter the challenge question"
                      value={draft.question}
                    />
                  </div>
                  <div>
                    <Label htmlFor="draft-answer">ANSWER</Label>
                    <Input
                      id="draft-answer"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          answer: event.target.value,
                        }))
                      }
                      placeholder="Enter the answer"
                      value={draft.answer}
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  onClick={() => {
                    setParentNodeIdForNewChild(null);
                    setDialogOpen(false);
                  }}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  CANCEL
                </Button>
                <Button
                  disabled={
                    createNodeMutation.isPending || updateNodeMutation.isPending
                  }
                  onClick={() => void saveDraft()}
                  size="compact"
                  type="button"
                >
                  {createNodeMutation.isPending
                    ? "CREATING..."
                    : updateNodeMutation.isPending
                      ? "SAVING..."
                      : editingNodeId
                        ? "SAVE"
                        : "CREATE"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmationOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4"
          role="dialog"
        >
          <div className="w-full max-w-lg border-4 border-amber-400 bg-slate-900 p-4 shadow-[8px_8px_0_rgba(251,191,36,0.25)] sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="retro m-0 text-base! text-amber-100 pl-4">
                Are you Sure?
              </h2>
              <button
                aria-label="Close dialog"
                className="text-amber-300 cursor-pointer"
                onClick={() => {
                  setDeleteConfirmationOpen(false);
                }}
                type="button"
              >
                <X />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="text-[10px] text-center mb-3">
                This action cannot be undone.
              </div>
              <div className="flex justify-around gap-3">
                <Button
                  onClick={() => {
                    setDeleteConfirmationOpen(false);
                  }}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  CANCEL
                </Button>
                <Button
                  disabled={clearMapMutation.isPending}
                  onClick={() => handleDeleteModalConfirmation()}
                  size="compact"
                  type="button"
                  variant="destructive"
                >
                  {clearMapMutation.isPending ? "DELETING..." : "DELETE"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
