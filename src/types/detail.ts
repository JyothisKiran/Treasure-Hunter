export interface ScanQrRequest {
    id: string;
}

export interface NodeAnswer {
    id: number;
    answer: string;
    is_nearest: boolean;
}

export interface CurrentNode {
    id: number;
    data: string;
    clue?: string | null;
    encoded_answer: string;
    answers: NodeAnswer[];
    effects: string;
    score: number;
    bonus: number;
    created_at: string;
}

export interface TeamMember {
    id: number;
    email: string;
}

export interface WinningTeam {
    id: number;
    name: string;
    score: number;
    life: number;
    attack: number;
    members: TeamMember[];
}

export interface SubmitScanResponse {
    detail: string;
    data?: CurrentNode | WinningTeam;
    score?: number;
    bonus?: number;
    life?: number;
    attack?: number;
    [key: string]: unknown;
}

export type ScanResponsePayload = SubmitScanResponse | string;

export interface CurrentNodeMessage {
    detail: string;
}

export type CurrentNodeResponse = CurrentNode | { data: CurrentNode } | CurrentNodeMessage;

export interface CurrentNodeResult {
    status: number;
    node?: CurrentNode;
    detail?: string;
}

export interface ScanQrResult {
    data: ScanResponsePayload;
    status: number;
}
