import {
  ComputeComponent,
  DatabaseComponent,
  NormalizedWorkloadSpec,
  StorageComponent,
  WorkloadType,
} from '../nws/nws.types';

export const STRUCTURED_LLM_CLIENT = Symbol('STRUCTURED_LLM_CLIENT');

export type ParserConfidence = 'high' | 'medium' | 'low';

export interface ParsedNwsDraft {
  draftNws: NormalizedWorkloadSpec;
  parserConfidence: ParserConfidence;
  fieldsRequiringReview: string[];
}

export interface StructuredWorkloadFormInput {
  workloadName?: string;
  workloadType?: WorkloadType;
  dailyActiveUsers?: number;
  peakConcurrentUsers?: number;
  regionPreference?: string;
  compute?: ComputeComponent[];
  storage?: StorageComponent[];
  database?: DatabaseComponent[];
  network?: Partial<NormalizedWorkloadSpec['network']>;
  availability?: {
    multiAz?: boolean;
    multiRegion?: boolean;
    slaTarget?: string;
  };
}

export interface StructuredLlmRequest {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
}

export interface StructuredLlmClient {
  createStructuredOutput(request: StructuredLlmRequest): Promise<unknown>;
}
