import { useSyncExternalStore } from 'react';

/** Payloads emitted by the server (server/src/worker.ts, queue/processors/analyze.ts). */
export type IngestProgress = {
  fileId: string;
  stage: 'parsing';
  percent: number;
  status: 'PROCESSING' | 'READY' | 'FAILED';
};
export type AnalysisStage = 'parsing' | 'analyzing' | 'summarizing' | 'done';
export type AnalysisProgress = { analysisId: string; fileId: string; stage: AnalysisStage; percent: number };

type State = { files: Record<string, IngestProgress>; analyses: Record<string, AnalysisProgress> };

let state: State = { files: {}, analyses: {} };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Latest live progress per file and analysis, fed by the socket; lost on reload by design. */
export const progressStore = {
  file(p: IngestProgress) {
    state = { ...state, files: { ...state.files, [p.fileId]: p } };
    emit();
  },
  analysis(p: AnalysisProgress) {
    state = { ...state, analyses: { ...state.analyses, [p.analysisId]: p } };
    emit();
  },
  reset() {
    state = { files: {}, analyses: {} };
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: () => state,
};

export const useLiveProgress = () => useSyncExternalStore(progressStore.subscribe, progressStore.get);
