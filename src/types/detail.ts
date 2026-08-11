export interface ScanQrRequest {
    id: string;
}

export interface CurrentNode {
    id: number;
    data: string;
    clue: string;
    encoded_answer: string;
    answers: string[];
    effects: string;
    score: number;
    bonus: number;
    created_at: string;
}

export interface SubmitScanResponse {
    detail: string;
    data?: CurrentNode;
    score?: number;
    bonus?: number;
    [key: string]: unknown;
}

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
    data: SubmitScanResponse;
    status: number;
}
