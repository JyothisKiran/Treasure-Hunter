import type { MapNode } from "@/types/map";

type Position = {
  x: number;
  y: number;
};

const GRID_SIZE = 16;

const NODE_WIDTH = 220;
const NODE_HEIGHT = 132;

const LOOP_NODE_GAP = 72;
const LOOP_PADDING = 80;

const LOOP_MIN_RADIUS = 260;

const LOOP_SEPARATION = 140;

function snap(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPosition(position: Position): Position {
  return {
    x: snap(position.x),
    y: snap(position.y),
  };
}

function canonicalCycle(ids: string[]): string {
  if (ids.length === 0) return "";

  const rotations: string[][] = [];

  for (let i = 0; i < ids.length; i += 1) {
    rotations.push([...ids.slice(i), ...ids.slice(0, i)]);
  }

  const reversed = [...ids].reverse();

  for (let i = 0; i < reversed.length; i += 1) {
    rotations.push([
      ...reversed.slice(i),
      ...reversed.slice(0, i),
    ]);
  }

  return rotations
    .map((rotation) => rotation.join("|"))
    .sort()[0];
}

/**
 * Find actual closed cycles.
 *
 * IMPORTANT:
 * This returns separate cycles.
 *
 * Example:
 *
 * A -> B -> C -> A
 * X -> Y -> Z -> X
 *
 * returns:
 *
 * [
 *   ["A", "B", "C"],
 *   ["X", "Y", "Z"]
 * ]
 *
 * It does NOT return:
 *
 * ["A", "B", "C", "X", "Y", "Z"]
 */
export function findLoops(nodes: MapNode[]): string[][] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const cycles = new Map<string, string>();

  const visitFrom = (
    startId: string,
    currentId: string,
    path: string[],
    visiting: Set<string>,
  ) => {
    const current = nodeMap.get(currentId);

    if (!current) return;

    for (const childId of current.children) {
      if (!nodeMap.has(childId)) continue;

      if (childId === startId) {
        if (path.length >= 3) {
          const key = canonicalCycle(path);

          if (!cycles.has(key)) {
            cycles.set(key, path);
          }
        }

        continue;
      }

      if (visiting.has(childId)) {
        continue;
      }

      /*
       * Prevent this DFS from wandering through a node that is smaller
       * than the start node. This gives us a stable enumeration and
       * avoids discovering the same cycle many times.
       */
      if (childId < startId) {
        continue;
      }

      visiting.add(childId);

      visitFrom(
        startId,
        childId,
        [...path, childId],
        visiting,
      );

      visiting.delete(childId);
    }
  };

  const sortedNodes = [...nodes].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  for (const node of sortedNodes) {
    const visiting = new Set<string>([node.id]);

    visitFrom(
      node.id,
      node.id,
      [node.id],
      visiting,
    );
  }

  return [...cycles.values()];
}

export function getLoopLayout(
  nodes: MapNode[],
  focusNodeId?: string,
): Map<string, Position> {
  const loops = findLoops(nodes);

  if (loops.length === 0) {
    return new Map();
  }

  const nodeMap = new Map(
    nodes.map((node) => [node.id, node]),
  );

  let selectedLoops = loops;

  if (focusNodeId) {
    selectedLoops = loops.filter((loop) =>
      loop.includes(focusNodeId),
    );
  }

  if (selectedLoops.length === 0) {
    return new Map();
  }

  const positions = new Map<string, Position>();

  /*
   * First arrange every loop around its EXISTING center.
   *
   * This is important.
   *
   * We do NOT put all loops around one global center.
   */
  const loopBounds: Array<{
    ids: string[];
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    centerX: number;
    centerY: number;
  }> = [];

  selectedLoops.forEach((loop) => {
    const loopNodes = loop
      .map((id) => nodeMap.get(id))
      .filter((node): node is MapNode => Boolean(node));

    if (loopNodes.length < 3) {
      return;
    }

    const centerX =
      loopNodes.reduce((sum, node) => sum + node.x, 0) /
      loopNodes.length;

    const centerY =
      loopNodes.reduce((sum, node) => sum + node.y, 0) /
      loopNodes.length;

    /*
     * Radius must be large enough that the rectangular nodes
     * don't collide with one another.
     */
    const nodeCount = loopNodes.length;

    const requiredRadius =
      (NODE_WIDTH + LOOP_NODE_GAP) /
      (2 * Math.sin(Math.PI / nodeCount));

    const radius = Math.max(
      LOOP_MIN_RADIUS,
      requiredRadius,
    );

    loop.forEach((id, index) => {
      const angle =
        -Math.PI / 2 +
        (index / nodeCount) * Math.PI * 2;

      positions.set(
        id,
        snapPosition({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        }),
      );
    });

    const loopPositions = loop
      .map((id) => positions.get(id))
      .filter(
        (position): position is Position =>
          Boolean(position),
      );

    const minX =
      Math.min(...loopPositions.map((position) => position.x)) -
      NODE_WIDTH / 2 -
      LOOP_PADDING;

    const maxX =
      Math.max(...loopPositions.map((position) => position.x)) +
      NODE_WIDTH / 2 +
      LOOP_PADDING;

    const minY =
      Math.min(...loopPositions.map((position) => position.y)) -
      NODE_HEIGHT / 2 -
      LOOP_PADDING;

    const maxY =
      Math.max(...loopPositions.map((position) => position.y)) +
      NODE_HEIGHT / 2 +
      LOOP_PADDING;

    loopBounds.push({
      ids: loop,
      minX,
      maxX,
      minY,
      maxY,
      centerX,
      centerY,
    });
  });

  /*
   * Separate independent loops.
   *
   * We only move an entire loop.
   * We never move individual nodes here.
   */
  for (let i = 0; i < loopBounds.length; i += 1) {
    const current = loopBounds[i];

    for (let j = 0; j < i; j += 1) {
      const previous = loopBounds[j];

      const overlapX =
        current.minX <
          previous.maxX + LOOP_SEPARATION &&
        current.maxX >
          previous.minX - LOOP_SEPARATION;

      const overlapY =
        current.minY <
          previous.maxY + LOOP_SEPARATION &&
        current.maxY >
          previous.minY - LOOP_SEPARATION;

      if (!overlapX || !overlapY) {
        continue;
      }

      /*
       * Push the current loop to the right of the
       * previous loop.
       */
      const shiftX =
        previous.maxX +
        LOOP_SEPARATION -
        current.minX;

      current.ids.forEach((id) => {
        const position = positions.get(id);

        if (!position) return;

        positions.set(id, {
          x: snap(position.x + shiftX),
          y: position.y,
        });
      });

      current.minX += shiftX;
      current.maxX += shiftX;
    }
  }

  return positions;
}