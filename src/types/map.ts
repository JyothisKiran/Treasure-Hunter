export type MapNodeType = "NODE" | "JUNCTION";

export interface MapNode {
  id: string;
  type: MapNodeType;
  x: number;
  y: number;
  question?: string;
  answer?: string;
  children: string[];
}

export interface TreasureMap {
  id: string;
  name: string;
  nodes: MapNode[];
}