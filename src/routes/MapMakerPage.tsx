import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import {
  Download,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { toast } from "@/components/ui/8bit/toast";
import type { MapNode, MapNodeType, TreasureMap } from "@/types/map";

const STORAGE_KEY = "treasure-hunter-map-maker";
const NODE_WIDTH = 220;
const NODE_HEIGHT = 132;
const NODE_HALF_WIDTH = NODE_WIDTH / 2;
const NODE_HALF_HEIGHT = NODE_HEIGHT / 2;
const DEFAULT_MAP: TreasureMap = {
  id: "treasure-map-1",
  name: "Untitled Expedition",
  nodes: [],
};
type DraftNode = { type: MapNodeType; question: string; answer: string };
const EMPTY_DRAFT: DraftNode = { type: "NODE", question: "", answer: "" };

interface SaveFilePickerOptions {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

interface FileSystemWritableFileStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

type SaveFilePicker = (
  options: SaveFilePickerOptions,
) => Promise<FileSystemFileHandleLike>;

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: SaveFilePicker;
};

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

function nextPosition(index: number) {
  return { x: 180 + (index % 4) * 320, y: 160 + Math.floor(index / 4) * 240 };
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
      positions.set(id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    });
  });
  return nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) ?? { x: node.x, y: node.y }),
  }));
}

function canAddChild(node: MapNode): boolean {
  const childLimit = node.type === "JUNCTION" ? 2 : 1;
  return node.children.length < childLimit;
}

function getNodeConnectionPath(source: MapNode, target: MapNode) {
  const deltaX = target.x - source.x;
  const sourceX = source.x + (deltaX >= 0 ? NODE_HALF_WIDTH : -NODE_HALF_WIDTH);
  const sourceY = source.y;
  const targetX = target.x + (deltaX >= 0 ? -NODE_HALF_WIDTH : NODE_HALF_WIDTH);
  const targetY = target.y;
  const bendX =
    source.x +
    (deltaX >= 0 ? NODE_HALF_WIDTH + Math.max(60, Math.abs(deltaX) * 0.35) : -(NODE_HALF_WIDTH + Math.max(60, Math.abs(deltaX) * 0.35)));

  return `M ${sourceX} ${sourceY} L ${bendX} ${sourceY} L ${bendX} ${targetY} L ${targetX} ${targetY}`;
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
  const [selectedEdge, setSelectedEdge] = useState<{
    sourceId: string;
    targetId: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const cycleNodes = findCycleNodes(map.nodes);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }, [map]);

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

  const handleCanvasPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget) return;
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
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
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
    if (drag.kind === "pan")
      setPan({ x: drag.originX + deltaX, y: drag.originY + deltaY });
    else if (drag.id)
      updateNode(drag.id, {
        x: drag.originX + deltaX / zoom,
        y: drag.originY + deltaY / zoom,
      });
  };

  const finishCanvasPointer = (event: ReactPointerEvent<HTMLElement>) => {
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
        node.id === nodeId ? { ...node, ...update } : node,
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

  const saveDraft = () => {
    if (
      draft.type === "NODE" &&
      (!draft.question.trim() || !draft.answer.trim())
    ) {
      toast("Nodes need a question and answer");
      return;
    }
    if (editingNodeId) {
      updateNode(editingNodeId, {
        type: draft.type,
        question: draft.type === "NODE" ? draft.question.trim() : undefined,
        answer: draft.type === "NODE" ? draft.answer.trim() : undefined,
      });
      setSelectedNodeId(editingNodeId);
      toast("Node updated");
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
      const basePosition = parentNode
        ? getNodePlacementNearParent(parentNode, parentNode.children.length)
        : nextPosition(map.nodes.length);
      const node: MapNode = {
        id: `${draft.type.toLowerCase()}-${map.nodes.length + 1}`,
        type: draft.type,
        ...basePosition,
        children: [],
        question: draft.type === "NODE" ? draft.question.trim() : undefined,
        answer: draft.type === "NODE" ? draft.answer.trim() : undefined,
      };
      setMap((current) => {
        const nextNodes = [...current.nodes, node];
        const nodesWithParent = parentNode
          ? nextNodes.map((existingNode) =>
              existingNode.id === parentNode.id
                ? { ...existingNode, children: [...existingNode.children, node.id] }
                : existingNode,
            )
          : nextNodes;
        return {
          ...current,
          nodes: layoutLoops(nodesWithParent),
        };
      });
      setSelectedNodeId(node.id);
      setParentNodeIdForNewChild(null);
      toast(parentNode ? `${draft.type} node added as child` : `${draft.type} node added`);
    }
    setDialogOpen(false);
  };

  const deleteNode = (nodeId: string) => {
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
    toast("Node deleted");
  };

  const deleteConnection = () => {
    if (!selectedEdge) return;
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
    toast("Connection removed");
  };

  const connectNodes = (targetId: string) => {
    if (!connectionSourceId) return;
    const source = map.nodes.find((node) => node.id === connectionSourceId);
    if (!source || source.children.includes(targetId)) {
      toast("That connection already exists");
      setConnectionSourceId(null);
      return;
    }
    if (!canAddChild(source)) {
      toast(`${source.type} nodes have reached their child limit`);
      setConnectionSourceId(null);
      return;
    }
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
    setConnectionSourceId(null);
    toast("Nodes connected");
  };

  const exportMap = async () => {
    const filename = `${map.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "treasure-map"}.json`;
    const content = JSON.stringify(map, null, 2);
    const saveFilePicker = (window as WindowWithSaveFilePicker)
      .showSaveFilePicker;

    if (saveFilePicker) {
      try {
        const fileHandle = await saveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "JSON files",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        toast("Map JSON saved successfully");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        toast("Failed to save map JSON");
      }
      return;
    }

    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    try {
      document.body.appendChild(link);
      link.click();
      toast("Map JSON download started");
    } catch {
      toast("Failed to save map JSON");
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  };

  const importMap = async (file: File) => {
    try {
      const imported = parseMap(JSON.parse(await file.text()));
      if (!imported) throw new Error("Invalid map");
      setMap({ ...imported, nodes: layoutLoops(imported.nodes) });
      setSelectedNodeId(null);
      toast("Map JSON imported");
    } catch {
      toast("That file is not a valid treasure map");
    }
  };

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
    <main className="map-maker-workspace retro flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-950/90 pt-5 text-left text-xs text-slate-100 sm:pt-5">
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <header className="sticky top-0 z-20 mb-3 flex shrink-0 flex-col gap-3 border-b-4 border-amber-400 bg-slate-950/95 px-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="mb-1 text-[9px] tracking-[0.2em] text-amber-300 sm:text-[10px]">
              ADMIN CONSTRUCTION DECK
            </p>
            <p className="m-0 text-sm text-amber-100">MAP MAKER</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Button onClick={() => fileInputRef.current?.click()} size="compact" type="button">
              <Upload className="size-4" /> IMPORT
            </Button>
            <input
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importMap(file);
                event.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            <Button onClick={exportMap} size="compact" type="button">
              <Download className="size-4" /> EXPORT JSON
            </Button>
          </div>
        </header>

        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col border-y-4 border-cyan-400 bg-slate-900 p-2 shadow-[6px_6px_0_rgba(8,145,178,0.25)] sm:p-3"
          aria-label="Map canvas"
        >
          <div className="mb-2 flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3">
            <Input
              aria-label="Map name"
              className="min-w-0 max-w-full flex-1 sm:max-w-sm"
              onChange={(event) =>
                setMap((current) => ({ ...current, name: event.target.value }))
              }
              size="compact"
              value={map.name}
            />
            <span className="text-[9px] text-cyan-200">
              {map.nodes.length} NODES /{" "}
              {map.nodes.reduce(
                (count, node) => count + node.children.length,
                0,
              )}{" "}
              LINKS
            </span>
          </div>
          <div
            className="relative min-h-0 w-full flex-1 overflow-hidden border-2 border-dashed border-cyan-700 bg-slate-950"
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
            <div
              className="absolute left-0 top-0 h-px w-px origin-top-left"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <svg
                className="absolute left-0 top-0 size-px overflow-visible"
                aria-label="Map connections"
              >
                <defs>
                  <marker
                    id="map-link-arrow"
                    markerHeight="10"
                    markerWidth="10"
                    orient="auto-start-reverse"
                    refX="8.5"
                    refY="3"
                    viewBox="0 0 10 10"
                  >
                    <path d="M 0 0 L 9 3 L 0 6 z" fill="#fbbf24" />
                  </marker>
                </defs>
                {map.nodes.flatMap((node) =>
                  node.children.map((childId) => {
                    const child = map.nodes.find(
                      (candidate) => candidate.id === childId,
                    );
                    const isSelected =
                      selectedEdge?.sourceId === node.id &&
                      selectedEdge.targetId === childId;
                    return child ? (
                      <path
                        className={
                          isSelected ? "stroke-red-300" : "stroke-amber-300"
                        }
                        d={getNodeConnectionPath(node, child)}
                        fill="none"
                        key={`${node.id}-${child.id}`}
                        markerEnd="url(#map-link-arrow)"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedEdge({
                            sourceId: node.id,
                            targetId: child.id,
                          });
                          setSelectedNodeId(null);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        strokeDasharray={isSelected ? undefined : "8 8"}
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                        strokeWidth={isSelected ? "5" : "2"}
                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      />
                    ) : null;
                  }),
                )}
              </svg>
              {map.nodes.map((node) => {
                const isSelected = node.id === selectedNodeId;
                const isSource = node.id === connectionSourceId;
                const isHovered = hoveredNodeId === node.id;
                const showAddChild = isHovered && canAddChild(node);
                return (
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    key={node.id}
                    style={{ left: node.x, top: node.y }}
                  >
                    <article
                      className={`relative w-55 border-4 ${node.type === "JUNCTION" ? "border-fuchsia-300 bg-fuchsia-950 text-fuchsia-100" : "border-emerald-300 bg-emerald-950 text-emerald-100"} ${isSelected ? "z-10 ring-4 ring-amber-300" : ""} ${isSource ? "ring-4 ring-cyan-300" : ""}`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (window.confirm("Delete this node and its connections?")) {
                          deleteNode(node.id);
                        }
                      }}
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
                        {showAddChild && (
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
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
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
            {map.nodes.length > 0 && (
              <button
                aria-label="Add node"
                className="absolute left-3 top-3 flex size-9 items-center justify-center border-2 border-emerald-300 bg-slate-950/90 text-emerald-200"
                onClick={() => openAddDialog(null)}
                title="Add node"
                type="button"
              >
                <Plus className="size-4" />
              </button>
            )}
            <div className="absolute right-3 top-3 flex items-center gap-1.5 border-2 border-cyan-600 bg-slate-950/90 p-1.5">
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
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-400">
            <span>
              {connectionSourceId
                ? "SELECT A DESTINATION NODE"
                : selectedEdge
                  ? "CONNECTION SELECTED"
                  : "SELECT A NODE OR CONNECTION"}
            </span>
            <div className="flex items-center gap-3">
              {selectedEdge && (
                <Button
                  onClick={deleteConnection}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="size-3" /> REMOVE LINK
                </Button>
              )}
              <Button onClick={resetMap} size="compact" type="button" variant="outline">
                <RotateCcw className="size-3" /> CLEAR
              </Button>
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
                <Button onClick={saveDraft} size="compact" type="button">
                  {editingNodeId ? "SAVE" : "CREATE"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
