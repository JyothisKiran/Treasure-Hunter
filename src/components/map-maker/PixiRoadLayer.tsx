import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";

import roadAtlasUrl from "@/assets/map-maker/treasure-road-tileset.png";

const MAP_GRID_SIZE = 16;
const ATLAS_SIZE = 1254;
const FLOW_SIZE = 3;
const FLOW_SPEED = 0.052;
const ROAD_JOIN_OVERLAP = 1;

type MapPoint = { x: number; y: number };
type RoadDirection = "up" | "right" | "down" | "left";
type RoadSpriteKind =
  | "horizontal-open"
  | "vertical-open"
  | "cap-left"
  | "cap-right"
  | "cap-top"
  | "cap-bottom"
  | "corner-top-left"
  | "corner-top-right"
  | "corner-bottom-left"
  | "corner-bottom-right";

type RoadSpriteDefinition = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
};

type RoadSegment = {
  start: MapPoint;
  end: MapPoint;
  direction: RoadDirection;
  length: number;
};

type RoadPiece = {
  kind: RoadSpriteKind;
  x: number;
  y: number;
};

type FlowParticle = {
  edgeId: string;
  phase: number;
  segments: RoadSegment[];
  sprite: Sprite;
  totalLength: number;
};

type EdgeContainer = {
  container: Container;
  signature: string;
};

type RendererState = {
  app: Application;
  edgeContainers: Map<string, EdgeContainer>;
  flows: FlowParticle[];
  roadTextures: Record<RoadSpriteKind, Texture>;
  world: Container;
};

export type PixiRoadEdge = {
  endpointCaps: { start: boolean; end: boolean };
  id: string;
  isSelected: boolean;
  points: MapPoint[];
};

export type PixiRoadLayerProps = {
  edges: PixiRoadEdge[];
  pan: MapPoint;
  zoom: number;
};

// Source rectangles are atlas pixels; their world size is intentionally separate
// from the map grid. Every map piece is an independently cropped Pixi texture.
const ROAD_SPRITES: Record<RoadSpriteKind, RoadSpriteDefinition> = {
  "horizontal-open": {
    sourceX: 252,
    sourceY: 38,
    sourceWidth: 100,
    sourceHeight: 100,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "vertical-open": {
    sourceX: 34,
    sourceY: 246,
    sourceWidth: 100,
    sourceHeight: 100,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "cap-left": {
    sourceX: 26,
    sourceY: 38,
    sourceWidth: 100,
    sourceHeight: 100,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "cap-right": {
    sourceX: 84,
    sourceY: 38,
    sourceWidth: 100,
    sourceHeight: 100,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "cap-top": {
    sourceX: 34,
    sourceY: 180,
    sourceWidth: 100,
    sourceHeight: 100,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "cap-bottom": {
    sourceX: 34,
    sourceY: 302,
    sourceWidth: 100,
    sourceHeight: 100,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "corner-top-left": {
    sourceX: 427,
    sourceY: 442,
    sourceWidth: 120,
    sourceHeight: 120,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "corner-top-right": {
    sourceX: 650,
    sourceY: 442,
    sourceWidth: 120,
    sourceHeight: 120,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "corner-bottom-left": {
    sourceX: 42,
    sourceY: 442,
    sourceWidth: 120,
    sourceHeight: 120,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
  "corner-bottom-right": {
    sourceX: 229,
    sourceY: 442,
    sourceWidth: 120,
    sourceHeight: 120,
    width: MAP_GRID_SIZE,
    height: MAP_GRID_SIZE,
  },
};

function getJoinedSpriteSize(
  kind: RoadSpriteKind,
  definition: RoadSpriteDefinition,
): MapPoint {
  if (kind === "horizontal-open" || kind === "cap-left" || kind === "cap-right") {
    return { x: definition.width + ROAD_JOIN_OVERLAP * 2, y: definition.height };
  }
  if (kind === "vertical-open" || kind === "cap-top" || kind === "cap-bottom") {
    return { x: definition.width, y: definition.height + ROAD_JOIN_OVERLAP * 2 };
  }
  return {
    x: definition.width + ROAD_JOIN_OVERLAP * 2,
    y: definition.height + ROAD_JOIN_OVERLAP * 2,
  };
}

const CORNER_SPRITES: Record<
  `${RoadDirection}:${RoadDirection}`,
  RoadSpriteKind | undefined
> = {
  "up:up": undefined,
  "up:right": "corner-bottom-right",
  "up:down": undefined,
  "up:left": "corner-bottom-left",
  "right:up": "corner-top-left",
  "right:right": undefined,
  "right:down": "corner-bottom-left",
  "right:left": undefined,
  "down:up": undefined,
  "down:right": "corner-top-right",
  "down:down": undefined,
  "down:left": "corner-top-left",
  "left:up": "corner-top-right",
  "left:right": undefined,
  "left:down": "corner-bottom-right",
  "left:left": undefined,
};

let atlasTexturePromise: Promise<Texture> | null = null;

function snapToGrid(value: number) {
  return Math.round(value / MAP_GRID_SIZE) * MAP_GRID_SIZE;
}

function snapPointToGrid(point: MapPoint): MapPoint {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}

function getDirection(from: MapPoint, to: MapPoint): RoadDirection {
  if (to.x > from.x) return "right";
  if (to.x < from.x) return "left";
  if (to.y > from.y) return "down";
  return "up";
}

function getStep(direction: RoadDirection): MapPoint {
  if (direction === "right") return { x: MAP_GRID_SIZE, y: 0 };
  if (direction === "left") return { x: -MAP_GRID_SIZE, y: 0 };
  if (direction === "down") return { x: 0, y: MAP_GRID_SIZE };
  return { x: 0, y: -MAP_GRID_SIZE };
}

function getCapKind(direction: RoadDirection): RoadSpriteKind {
  if (direction === "left") return "cap-left";
  if (direction === "right") return "cap-right";
  if (direction === "up") return "cap-top";
  return "cap-bottom";
}

function oppositeDirection(direction: RoadDirection): RoadDirection {
  if (direction === "up") return "down";
  if (direction === "down") return "up";
  if (direction === "left") return "right";
  return "left";
}

function normalizeRoutePoints(points: MapPoint[]): MapPoint[] {
  return points.map(snapPointToGrid).filter((point, index, route) => {
    const previous = route[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

function decomposeRoute(points: MapPoint[]): RoadSegment[] {
  const route = normalizeRoutePoints(points);
  const segments: RoadSegment[] = [];
  route.slice(1).forEach((end, index) => {
    const start = route[index];
    if (start.x !== end.x && start.y !== end.y) return;
    const direction = getDirection(start, end);
    const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    if (length) segments.push({ start, end, direction, length });
  });
  return segments;
}

function getCornerKind(
  previous: RoadDirection,
  next: RoadDirection,
): RoadSpriteKind | null {
  return CORNER_SPRITES[`${previous}:${next}`] ?? null;
}

function getSegmentPieces(
  segment: RoadSegment,
  segmentIndex: number,
  segmentCount: number,
  endpointCaps: { start: boolean; end: boolean },
): RoadPiece[] {
  const pieces: RoadPiece[] = [];
  const step = getStep(segment.direction);
  const steps = segment.length / MAP_GRID_SIZE;
  const isFirst = segmentIndex === 0;
  const isLast = segmentIndex === segmentCount - 1;
  const firstVisibleStep = isFirst && endpointCaps.start ? 1 : 0;
  const lastVisibleStep = isLast && endpointCaps.end ? steps - 1 : steps;

  for (let index = firstVisibleStep; index <= lastVisibleStep; index += 1) {
    const isStartCap = isFirst && endpointCaps.start && index === 1;
    const isEndCap = isLast && endpointCaps.end && index === steps - 1;
    pieces.push({
      kind:
        isStartCap
          ? getCapKind(oppositeDirection(segment.direction))
          : isEndCap
            ? getCapKind(segment.direction)
            : segment.direction === "left" || segment.direction === "right"
              ? "horizontal-open"
              : "vertical-open",
      x: segment.start.x + step.x * index,
      y: segment.start.y + step.y * index,
    });
  }
  return pieces;
}

function createRoadPieces(edge: PixiRoadEdge, segments: RoadSegment[]): RoadPiece[] {
  const pieces = segments.flatMap((segment, index) =>
    getSegmentPieces(
      segment,
      index,
      segments.length,
      edge.endpointCaps,
    ),
  );
  segments.slice(0, -1).forEach((segment, index) => {
    const cornerKind = getCornerKind(segment.direction, segments[index + 1].direction);
    if (!cornerKind) return;
    pieces.push({ kind: cornerKind, x: segment.end.x, y: segment.end.y });
  });
  return pieces;
}

function getEdgeSignature(edge: PixiRoadEdge): string {
  return [
    edge.id,
    edge.isSelected ? "selected" : "idle",
    edge.endpointCaps.start ? "start-cap" : "start-open",
    edge.endpointCaps.end ? "end-cap" : "end-open",
    ...normalizeRoutePoints(edge.points).map((point) => `${point.x}:${point.y}`),
  ].join("|");
}

function getFlowPosition(segments: RoadSegment[], distance: number): MapPoint {
  let remaining = distance;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const step = getStep(segment.direction);
      return {
        x: segment.start.x + MAP_GRID_SIZE / 2 + (step.x / MAP_GRID_SIZE) * remaining,
        y: segment.start.y + MAP_GRID_SIZE / 2 + (step.y / MAP_GRID_SIZE) * remaining,
      };
    }
    remaining -= segment.length;
  }
  const last = segments.at(-1);
  return last
    ? { x: last.end.x + MAP_GRID_SIZE / 2, y: last.end.y + MAP_GRID_SIZE / 2 }
    : { x: 0, y: 0 };
}

function makeTransparentAtlas(): Promise<Texture> {
  if (atlasTexturePromise) return atlasTexturePromise;
  atlasTexturePromise = new Promise<Texture>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ATLAS_SIZE;
      canvas.height = ATLAS_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("Could not create a canvas for the road atlas."));
        return;
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, ATLAS_SIZE, ATLAS_SIZE);
      const imageData = context.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE);
      for (let index = 0; index < imageData.data.length; index += 4) {
        const red = imageData.data[index];
        const green = imageData.data[index + 1];
        const blue = imageData.data[index + 2];
        if (red + green + blue < 56) imageData.data[index + 3] = 0;
      }
      context.putImageData(imageData, 0, 0);
      resolve(Texture.from({ resource: canvas, scaleMode: "nearest" }));
    };
    image.onerror = () => reject(new Error("Could not load the road sprite atlas."));
    image.src = roadAtlasUrl;
  });
  return atlasTexturePromise;
}

function getRoadTextures(atlasTexture: Texture): Record<RoadSpriteKind, Texture> {
  return Object.fromEntries(
    Object.entries(ROAD_SPRITES).map(([kind, definition]) => [
      kind,
      new Texture({
        source: atlasTexture.source,
        frame: new Rectangle(
          definition.sourceX,
          definition.sourceY,
          definition.sourceWidth,
          definition.sourceHeight,
        ),
      }),
    ]),
  ) as Record<RoadSpriteKind, Texture>;
}

function destroyEdgeContainer(state: RendererState, edgeId: string) {
  const current = state.edgeContainers.get(edgeId);
  if (!current) return;
  current.container.parent?.removeChild(current.container);
  current.container.destroy({ children: true });
  state.edgeContainers.delete(edgeId);
  state.flows = state.flows.filter((flow) => flow.edgeId !== edgeId);
}

function createEdgeContainer(state: RendererState, edge: PixiRoadEdge) {
  const segments = decomposeRoute(edge.points);
  if (!segments.length) return;
  const container = new Container();
  container.label = `road-edge:${edge.id}`;
  container.eventMode = "none";
  const pieces = createRoadPieces(edge, segments);

  pieces.forEach((piece) => {
    const definition = ROAD_SPRITES[piece.kind];
    const size = getJoinedSpriteSize(piece.kind, definition);
    const sprite = new Sprite({
      texture: state.roadTextures[piece.kind],
      roundPixels: true,
    });
    sprite.label = `${edge.id}:${piece.kind}`;
    sprite.eventMode = "none";
    const extendsHorizontally =
      size.x > definition.width;
    const extendsVertically =
      size.y > definition.height;
    sprite.position.set(
      piece.x - (extendsHorizontally ? ROAD_JOIN_OVERLAP : 0),
      piece.y - (extendsVertically ? ROAD_JOIN_OVERLAP : 0),
    );
    // Extend around the tile on both sides so joins do not expose a seam.
    sprite.width = size.x;
    sprite.height = size.y;
    if (edge.isSelected) sprite.tint = 0xffd7d7;
    container.addChild(sprite);
  });

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength) {
    [0, Math.max(MAP_GRID_SIZE * 3, Math.floor(totalLength / 2))].forEach(
      (phase) => {
        const flowSprite = new Sprite({ texture: Texture.WHITE, roundPixels: true });
        flowSprite.anchor.set(0.5);
        flowSprite.eventMode = "none";
        flowSprite.tint = edge.isSelected ? 0xfecaca : 0xfff1a8;
        flowSprite.width = FLOW_SIZE;
        flowSprite.height = FLOW_SIZE;
        container.addChild(flowSprite);
        state.flows.push({
          edgeId: edge.id,
          phase,
          segments,
          sprite: flowSprite,
          totalLength,
        });
      },
    );
  }

  state.world.addChild(container);
  state.edgeContainers.set(edge.id, {
    container,
    signature: getEdgeSignature(edge),
  });
}

function syncEdges(state: RendererState, edges: PixiRoadEdge[]) {
  const currentEdgeIds = new Set(edges.map((edge) => edge.id));
  [...state.edgeContainers.keys()].forEach((edgeId) => {
    if (!currentEdgeIds.has(edgeId)) destroyEdgeContainer(state, edgeId);
  });
  edges.forEach((edge) => {
    const signature = getEdgeSignature(edge);
    if (state.edgeContainers.get(edge.id)?.signature === signature) return;
    destroyEdgeContainer(state, edge.id);
    createEdgeContainer(state, edge);
  });
}

function updateWorldTransform(state: RendererState, pan: MapPoint, zoom: number) {
  state.world.position.set(Math.round(pan.x), Math.round(pan.y));
  state.world.scale.set(zoom);
}

export function PixiRoadLayer({ edges, pan, zoom }: PixiRoadLayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<RendererState | null>(null);
  const latestRef = useRef({ edges, pan, zoom });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const initialize = async () => {
      await app.init({
        antialias: false,
        autoDensity: true,
        backgroundAlpha: 0,
        height: host.clientHeight,
        preference: "webgl",
        resolution: 1,
        width: host.clientWidth,
      });
      if (disposed) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }
      app.canvas.setAttribute("aria-hidden", "true");
      app.canvas.style.height = "100%";
      app.canvas.style.imageRendering = "pixelated";
      app.canvas.style.pointerEvents = "none";
      app.canvas.style.position = "absolute";
      app.canvas.style.width = "100%";
      host.appendChild(app.canvas);

      const atlasTexture = await makeTransparentAtlas();
      if (disposed) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }
      const world = new Container();
      world.label = "road-world";
      world.eventMode = "none";
      app.stage.addChild(world);
      const state: RendererState = {
        app,
        edgeContainers: new Map(),
        flows: [],
        roadTextures: getRoadTextures(atlasTexture),
        world,
      };
      const tick = () => {
        const elapsed = performance.now() * FLOW_SPEED;
        state.flows.forEach((flow) => {
          const distance =
            Math.floor((elapsed + flow.phase) / MAP_GRID_SIZE) * MAP_GRID_SIZE;
          const point = getFlowPosition(flow.segments, distance % flow.totalLength);
          flow.sprite.position.set(Math.round(point.x), Math.round(point.y));
        });
      };
      app.ticker.add(tick);
      stateRef.current = state;

      const resize = () => {
        app.renderer.resize(host.clientWidth, host.clientHeight);
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);

      updateWorldTransform(state, latestRef.current.pan, latestRef.current.zoom);
      syncEdges(state, latestRef.current.edges);

      // Keep the Pixi ticker callback alive without React-driven animation.
      void tick;
    };

    void initialize().catch(() => {
      // The map editor remains usable through its React node controls if WebGL
      // cannot initialize on a particular device.
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      const state = stateRef.current;
      if (state?.app === app) {
        stateRef.current = null;
        app.destroy({ removeView: true }, { children: true });
      }
    };
  }, []);

  useEffect(() => {
    latestRef.current = { edges, pan, zoom };
    const state = stateRef.current;
    if (!state) return;
    updateWorldTransform(state, pan, zoom);
    syncEdges(state, edges);
  }, [edges, pan, zoom]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      ref={hostRef}
    />
  );
}
