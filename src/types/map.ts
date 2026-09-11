export type MapNodeType = "NODE" | "JUNCTION";

export interface MapNode {
  id: string;
  type: MapNodeType;
  x: number;
  y: number;
  question?: string;
  answer?: string;
  children: string[];
  isCycle?: boolean;
  metadata?: BackendMapNodeMetadata;
}

export interface TreasureMap {
  id: string;
  name: string;
  nodes: MapNode[];
}

export interface BackendMapNodeMetadata {
  clue?: string | null;
  effects: string;
  score: number;
  bonus: number;
  life: number;
  attack: number;
  isNearest: boolean;
  parentId: number | null;
  altParentId: number | null;
  altChildId: number | null;
  level: number;
  status: string;
  isCurrent: boolean;
  isHead: boolean;
  isCheckpoint: boolean;
  createdAt: string;
}

export interface BackendMapNode {
  id: number;
  data: string;
  clue?: string | null;
  answer?: string | null;
  effects: string;
  score: number;
  bonus: number;
  life: number;
  attack: number;
  is_nearest: boolean;
  parent_id: number | null;
  alt_parent_id: number | null;
  alt_child_id: number | null;
  children_ids: number[];
  level: number;
  status: string;
  is_current: boolean;
  is_head: boolean;
  is_checkpoint: boolean;
  created_at: string;
}

export interface BackendMapEdge {
  id: string;
  source: number;
  target: number;
  type: string;
  is_cycle: boolean;
}

export interface BackendTeamState {
  id: number;
  name: string;
  score: number;
  life: number;
  attack: number;
  is_won: boolean;
  current_node_id: number | null;
  head_id: number | null;
  last_checkpoint_id: number | null;
}

export interface BackendMap {
  nodes: BackendMapNode[];
  edges: BackendMapEdge[];
  total_nodes: number;
  total_edges: number;
  team_state: BackendTeamState | null;
}

export interface CreateMapNodeRequest {
  data: string;
  clue?: string;
  answer: string;
  effects?: string;
  score?: number;
  bonus?: number;
  life?: number;
  attack?: number;
  parent?: number | null;
  alt_parent?: number;
}

export interface UpdateMapNodeRequest {
  data?: string;
  answer?: string;
  effects?: string;
}

export type CreateMapNodeResponse = BackendMapNode | { data: BackendMapNode };

export interface SetNodeRelationRequest {
  parent_id: number;
  child_id: number;
}

export interface RemoveNodeRelationRequest {
  node1_id: number;
  node2_id: number;
}
