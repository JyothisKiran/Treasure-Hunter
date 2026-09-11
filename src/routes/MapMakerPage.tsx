import {
  useEffect,
  type MouseEvent as ReactMouseEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

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

const STORAGE_KEY = "treasure-hunter-map-maker";
const NODE_WIDTH = 220;
const NODE_HEIGHT = 132;
const NODE_HALF_WIDTH = NODE_WIDTH / 2;
const NODE_HALF_HEIGHT = NODE_HEIGHT / 2;
const ALIGNMENT_EPSILON = 4;
const ROUTING_LANE_GAP = 28;
const MAP_GRID_SIZE = 16;
const PIXEL_ROAD_TILE_SIZE = MAP_GRID_SIZE;
const PIXEL_ROAD_HIT_WIDTH = 20;
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

// interface SaveFilePickerOptions {
//   suggestedName: string;
//   types: Array<{
//     description: string;
//     accept: Record<string, string[]>;
//   }>;
// }

// interface FileSystemWritableFileStreamLike {
//   write(data: string): Promise<void>;
//   close(): Promise<void>;
// }

// interface FileSystemFileHandleLike {
//   createWritable(): Promise<FileSystemWritableFileStreamLike>;
// }

// type SaveFilePicker = (
//   options: SaveFilePickerOptions,
// ) => Promise<FileSystemFileHandleLike>;

// type WindowWithSaveFilePicker = Window & {
//   showSaveFilePicker?: SaveFilePicker;
// };

function isMapNode(value: unknown): value is MapNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<MapNode>;
  return (
    typeof node.id === "string" &&
    (node.type === "NODE" || node.type === "JUNCTION") &&
    typeof node.x === "number" &&
    typeof node.y === "number" &&
    Array.isArray(node.children) &&
    node.children.every((child) => typeof child === "string")
  );
}

function parseMap(value: unknown): TreasureMap | null {
  if (!value || typeof value !== "object") return null;
  const map = value as Partial<TreasureMap>;
  if (
    typeof map.id !== "string" ||
    typeof map.name !== "string" ||
    !Array.isArray(map.nodes)
  )
    return null;
  return map.nodes.every(isMapNode)
    ? { id: map.id, name: map.name, nodes: map.nodes }
    : null;
}

function loadMap(): TreasureMap {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const loaded = saved
      ? (parseMap(JSON.parse(saved)) ?? DEFAULT_MAP)
      : DEFAULT_MAP;
    return { ...loaded, nodes: layoutLoops(loaded.nodes) };
  } catch {
    return DEFAULT_MAP;
  }
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

function findCycleNodes(nodes: MapNode[]): Set<string> {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();
  const stack: string[] = [];
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      stack.slice(cycleStart).forEach((id) => cycleNodes.add(id));
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    stack.push(nodeId);
    nodes.find((node) => node.id === nodeId)?.children.forEach(visit);
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  nodes.forEach((node) => visit(node.id));
  return cycleNodes;
}

function getCycleGroups(nodes: MapNode[]): string[][] {
  const cycleIds = findCycleNodes(nodes);
  const groups: string[][] = [];
  const remaining = new Set(cycleIds);
  while (remaining.size) {
    const group: string[] = [];
    const queue = [remaining.values().next().value as string];
    remaining.delete(queue[0]);
    while (queue.length) {
      const id = queue.shift();
      if (!id) continue;
      group.push(id);
      nodes
        .filter((node) => node.id === id || node.children.includes(id))
        .forEach((node) => {
          if (remaining.has(node.id)) {
            remaining.delete(node.id);
            queue.push(node.id);
          }
        });
    }
    groups.push(group);
  }
  return groups;
}

function layoutLoops(nodes: MapNode[]): MapNode[] {
  const groups = getCycleGroups(nodes);
  if (!groups.length) return nodes;
  const positions = new Map(
    nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );
  groups.forEach((group) => {
    const centerX =
      group.reduce((sum, id) => sum + (positions.get(id)?.x ?? 400), 0) /
      group.length;
    const centerY =
      group.reduce((sum, id) => sum + (positions.get(id)?.y ?? 300), 0) /
      group.length;
    const nodeWidth = 220;
    const nodeHeight = 132;
    const gap = 64;
    const radius = Math.max(
      nodeHeight / 2 + gap,
      nodeWidth / (2 * Math.sin(Math.PI / group.length)) + gap,
    );
    group.forEach((id, index) => {
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2;
      positions.set(id, snapPointToGrid({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      }));
    });
  });
  return nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) ?? snapPointToGrid(node)),
  }));
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

type ConnectedEdge = { source: MapNode; target: MapNode; endpoint: "source" | "target" };

function getSideConnections(nodes: MapNode[], node: MapNode, side: RoadDirection) {
  const connections: ConnectedEdge[] = [];
  nodes.forEach((source) => {
    source.children.forEach((childId) => {
      const target = nodes.find((candidate) => candidate.id === childId);
      if (!target) return;
      if (source.id === node.id && getEndpointSide(source, target, "source") === side)
        connections.push({ source, target, endpoint: "source" });
      if (target.id === node.id && getEndpointSide(source, target, "target") === side)
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
  const sourcePortOffset = getPortOffset(
    sourceIndex,
    sourceConnections.length,
    Math.min(NODE_HALF_WIDTH - 18, NODE_HALF_HEIGHT - 18),
  );
  const targetPortOffset = getPortOffset(
    targetIndex,
    targetConnections.length,
    Math.min(NODE_HALF_WIDTH - 18, NODE_HALF_HEIGHT - 18),
  );
  const laneOffset =
    sourceConnections.length > 1
      ? getLaneOffset(sourceIndex, sourceConnections.length)
      : getLaneOffset(targetIndex, targetConnections.length);

  return { sourcePortOffset, targetPortOffset, laneOffset };
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
      Math.abs(sourceX - targetX) <= ALIGNMENT_EPSILON
    )
      return normalizeRoutePoints([
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
      ]);
    const midpoint = (sourceY + targetY) / 2;
    const maxLaneOffset = Math.max(0, Math.abs(targetY - sourceY) / 2 - 12);
    const bendY =
      midpoint +
      Math.max(-maxLaneOffset, Math.min(maxLaneOffset, routing.laneOffset));
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
    Math.abs(sourceY - targetY) <= ALIGNMENT_EPSILON
  )
    return normalizeRoutePoints([
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ]);
  const midpoint = (sourceX + targetX) / 2;
  const maxLaneOffset = Math.max(0, Math.abs(targetX - sourceX) / 2 - 12);
  const bendX =
    midpoint +
    Math.max(-maxLaneOffset, Math.min(maxLaneOffset, routing.laneOffset));

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
      return [{
        endpointCaps: getEndpointCaps(source, target),
        id: `${source.id}-${target.id}`,
        isSelected:
          selectedEdge?.sourceId === source.id &&
          selectedEdge.targetId === target.id,
        points,
        roadPath: getRoadPath(points),
        sourceId: source.id,
        targetId: target.id,
      }];
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

function mapFromBackendMap(
  backendMap: BackendMap,
  previousNodes: MapNode[] = [],
): TreasureMap {
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
  const positions = new Map(
    previousNodes.map((node) => [node.id, snapPointToGrid(node)]),
  );

  const nodes = backendMap.nodes.map((node, index): MapNode => {
    const id = String(node.id);
    return {
      id,
      type: node.effects === "JUNCTION" ? "JUNCTION" : "NODE",
      ...(positions.get(id) ?? nextPosition(index)),
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
      },
    };
  });

  return {
    id: String(backendMap.team_state?.id ?? "server-map"),
    name: backendMap.team_state?.name ?? "Team Map",
    nodes: layoutLoops(nodes),
  };
}

function mapFromBackendMaps(
  backendMaps: BackendMap,
  previousNodes: MapNode[] = [],
): TreasureMap {
  return backendMaps.nodes.length
    ? mapFromBackendMap(backendMaps, previousNodes)
    : DEFAULT_MAP;
}

export default function MapMakerPage() {
  const [map, setMap] = useState<TreasureMap>(loadMap);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [parentNodeIdForNewChild, setParentNodeIdForNewChild] = useState<
    string | null
  >(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftNode>(EMPTY_DRAFT);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedEdge, setSelectedEdge] = useState<EdgeSelection | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
    null,
  );
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
  // const fileInputRef = useRef<HTMLInputElement>(null);
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
  const cycleNodes = new Set([
    ...findCycleNodes(map.nodes),
    ...map.nodes.filter((node) => node.isCycle).map((node) => node.id),
  ]);
  const roadEdges = getMapRoadEdges(map.nodes, selectedEdge);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }, [map]);
  useEffect(() => {
    if (!backendMaps) return;
    const syncMap = window.setTimeout(() => {      
      setMap((current) => mapFromBackendMaps(backendMaps, current.nodes));
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

  const setZoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const boundedZoom = Math.min(2.5, Math.max(0.35, nextZoom));
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
        ? map.nodes.find((node) => node.id === parentNodeIdForNewChild) ?? null
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
        const created = unwrapCreatedNode(
          await createNodeMutation.mutateAsync({
            data: draft.type === "JUNCTION" ? "JUNCTION" : question,
            clue: draft.type === "JUNCTION" ? "" : question,
            answer: draft.type === "JUNCTION" ? "" : answer,
            effects: draft.type === "JUNCTION" ? "JUNCTION" : "UNLOCKED",
            parent: parentBackendId
          }),
        );
        const node: MapNode = {
          id: String(created.id),
          type: created.effects === "JUNCTION" ? "JUNCTION" : "NODE",
          ...basePosition,
          children: [],
          question: created.data,
          answer: created.answer ?? undefined,
          metadata: {
            clue: created.clue,
            effects: created.effects,
            score: created.score,
            bonus: created.bonus,
            life: created.life,
            attack: created.attack,
            isNearest: created.is_nearest,
            parentId: created.parent_id,
            altParentId: created.alt_parent_id,
            altChildId: created.alt_child_id,
            level: created.level,
            status: created.status,
            isCurrent: created.is_current,
            isHead: created.is_head,
            isCheckpoint: created.is_checkpoint,
            createdAt: created.created_at,
          },
        };
        setMap((current) => {
          const nextNodes = [...current.nodes, node];
          const nodesWithParent = parentNode
            ? nextNodes.map((existingNode) =>
                existingNode.id === parentNode.id
                  ? {
                      ...existingNode,
                      children: [...existingNode.children, node.id],
                    }
                  : existingNode,
              )
            : nextNodes;
          return { ...current, nodes: layoutLoops(nodesWithParent) };
        });
        setSelectedNodeId(node.id);
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
    setDialogOpen(false);
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
    setConnectionSourceId((current) =>
      current === nodeId ? null : current,
    );
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
      toast(
        "A node cannot connect to itself"
      );
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
        nodes: layoutLoops(
          current.nodes.map((node) =>
            node.id === connectionSourceId
              ? { ...node, children: [...node.children, targetId] }
              : node,
          ),
        ),
      }));
      void queryClient.invalidateQueries({
        queryKey: MAP_MAKER_MAPS_QUERY_KEY,
      });
      toast("Nodes connected");
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
      x: Math.min(Math.max(8, event.clientX - bounds.left), bounds.width - menuWidth - 8),
      y: Math.min(Math.max(8, event.clientY - bounds.top), bounds.height - menuHeight - 8),
    });
    setSelectedNodeId(nodeId);
    setSelectedEdge(null);
  };

  // const exportMap = async () => {
  //   const filename = `${map.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "treasure-map"}.json`;
  //   const content = JSON.stringify(map, null, 2);
  //   const saveFilePicker = (window as WindowWithSaveFilePicker)
  //     .showSaveFilePicker;

  //   if (saveFilePicker) {
  //     try {
  //       const fileHandle = await saveFilePicker({
  //         suggestedName: filename,
  //         types: [
  //           {
  //             description: "JSON files",
  //             accept: { "application/json": [".json"] },
  //           },
  //         ],
  //       });
  //       const writable = await fileHandle.createWritable();
  //       await writable.write(content);
  //       await writable.close();
  //       toast("Map JSON saved successfully");
  //     } catch (error: unknown) {
  //       if (error instanceof DOMException && error.name === "AbortError")
  //         return;
  //       toast("Failed to save map JSON");
  //     }
  //     return;
  //   }

  //   const url = URL.createObjectURL(
  //     new Blob([content], { type: "application/json" }),
  //   );
  //   const link = document.createElement("a");
  //   link.href = url;
  //   link.download = filename;
  //   try {
  //     document.body.appendChild(link);
  //     link.click();
  //     toast("Map JSON download started");
  //   } catch {
  //     toast("Failed to save map JSON");
  //   } finally {
  //     link.remove();
  //     URL.revokeObjectURL(url);
  //   }
  // };

  // const importMap = async (file: File) => {
  //   try {
  //     const imported = parseMap(JSON.parse(await file.text()));
  //     if (!imported) throw new Error("Invalid map");
  //     setMap({ ...imported, nodes: layoutLoops(imported.nodes) });
  //     setSelectedNodeId(null);
  //     toast("Map JSON imported");
  //   } catch {
  //     toast("That file is not a valid treasure map");
  //   }
  // };

  const resetMap = () => {
    setMap(DEFAULT_MAP);
    setSelectedNodeId(null);
    setSelectedEdge(null);
    setConnectionSourceId(null);
    toast("Map cleared");
  };

  const resetView = () => {
    const viewport = viewportRef.current;
    if (!viewport || !map.nodes.length) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const padding = 80;
    const minX = Math.min(...map.nodes.map((node) => node.x - NODE_HALF_WIDTH));
    const maxX = Math.max(...map.nodes.map((node) => node.x + NODE_HALF_WIDTH));
    const minY = Math.min(...map.nodes.map((node) => node.y - NODE_HALF_HEIGHT));
    const maxY = Math.max(...map.nodes.map((node) => node.y + NODE_HALF_HEIGHT));
    const graphWidth = Math.max(maxX - minX, 1);
    const graphHeight = Math.max(maxY - minY, 1);
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const nextZoom = Math.min(
      2.5,
      Math.max(
        0.35,
        Math.min(
          (viewportWidth - padding * 2) / graphWidth,
          (viewportHeight - padding * 2) / graphHeight,
        ),
      ),
    );
    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan({
      x: viewportWidth / 2 - graphCenterX * nextZoom,
      y: viewportHeight / 2 - graphCenterY * nextZoom,
    });
  };

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
              backgroundImage:
                "linear-gradient(rgba(34,211,238,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.09) 1px, transparent 1px)",
              backgroundPosition: `${pan.x % (32 * zoom)}px ${pan.y % (32 * zoom)}px`,
              backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
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
                          strokeWidth={PIXEL_ROAD_HIT_WIDTH}
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
                      onContextMenu={(event) => openNodeContextMenu(event, node.id)}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        openEditDialog(node);
                      }}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
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
                        if (!drag || drag.kind !== "node" || drag.id !== node.id) return;
                        const deltaX = event.clientX - drag.startX;
                        const deltaY = event.clientY - drag.startY;
                        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) drag.moved = true;
                        if (drag.moved) {
                          updateNode(drag.id, {
                            x: drag.originX + deltaX / zoom,
                            y: drag.originY + deltaY / zoom,
                          });
                        }
                      }}
                      onPointerUp={(event) => {
                        event.stopPropagation();
                        const drag = dragRef.current;
                        if (drag && drag.kind === "node" && drag.id === node.id) {
                          if (drag.moved) {
                            setSelectedNodeId(node.id);
                          }
                          dragRef.current = null;
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }
                        }
                      }}
                      onPointerCancel={(event) => {
                        event.stopPropagation();
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                        dragRef.current = null;
                      }}
                      style={{ height: NODE_HEIGHT, width: NODE_WIDTH }}
                    >
                      <div className="p-3">
                        <div className="block w-full text-left">
                          <span className="block text-[8px] text-amber-300">
                            {node.type}
                            {cycleNodes.has(node.id) && " / LOOP"}
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
                onClick={() => setZoomAt(zoom - 0.15)}
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
                onClick={() => setZoomAt(zoom + 0.15)}
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
                  {removeRelationMutation.isPending ? "REMOVING..." : "REMOVE LINK"}
                </Button>
              )}
              <Button onClick={resetMap} size="compact" type="button" variant="outline">
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
                  disabled={createNodeMutation.isPending || updateNodeMutation.isPending}
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
    </main>
  );
}
