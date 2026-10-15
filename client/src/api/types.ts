import type { components } from './schema';

type Schemas = components['schemas'];

// Short names for the generated contract types; never redefine a shape by hand.
export type Analysis = Schemas['Analysis'];
export type AnalysisResult = NonNullable<Schemas['AnalysisResult']>;
export type AnalysisError = NonNullable<Schemas['AnalysisError']>;
export type Summary = Schemas['Summary'];
export type Anomaly = Schemas['Anomaly'];
export type ChartSpec = Schemas['ChartSpec'];
export type AuditLog = Schemas['AuditLog'];
export type TokenPair = Schemas['TokenPair'];
export type User = Schemas['User'];
export type Role = Schemas['Role'];
export type FileItem = Schemas['File'];
export type FileStatus = Schemas['FileStatus'];
export type FileDetail = Schemas['FileDetail'];
export type Sheet = Schemas['Sheet'];
export type Column = Schemas['Column'];
export type Row = Schemas['Row'];
export type UnmaskResult = Schemas['UnmaskResult'];
export type Webhook = Schemas['Webhook'];
export type CreatedWebhook = Schemas['CreatedWebhook'];
export type Severity = Anomaly['severity'];
