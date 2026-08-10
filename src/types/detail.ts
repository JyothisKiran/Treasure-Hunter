export interface ScanQrRequest {
    id: string;
}

export interface ScanQrResponse{
    id: string;
    data: string;
    clue_length: string;
    clue: string;
    effects: string;
    score: number;
    bonus: number;
}