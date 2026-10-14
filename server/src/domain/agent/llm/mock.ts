import type { ChatMessage, CompletionOptions, LLMProvider, LLMResponse, ToolDefinition } from './types.js';

type Overview = {
  sheets: {
    name: string;
    rowCount: number;
    amountTotals?: { column: string; sum: number; mean: number }[];
  }[];
  severityCounts: Record<string, number>;
};
type AnomalyLite = { id: string; type: string; severity: string; description: string; column?: string };

const RECOMMENDATIONS: Record<string, { en: string; az: string }> = {
  structuring: {
    en: 'Review the transactions just below the reporting threshold for possible structuring and escalate to compliance.',
    az: 'Hesabat həddindən bir qədər aşağı olan əməliyyatları mümkün strukturlaşdırma baxımından yoxlayın və uyğunluq şöbəsinə ötürün.',
  },
  outlier: {
    en: 'Verify the outlier amounts against source documents before month-end close.',
    az: 'Kənar dəyərli məbləğləri ay sonu bağlanışından əvvəl ilkin sənədlərlə yoxlayın.',
  },
  exact_duplicate: {
    en: 'Confirm whether duplicated rows are double postings and reverse them if so.',
    az: 'Təkrarlanan sətirlərin ikiqat yazılış olub-olmadığını təsdiqləyin və belədirsə, ləğv edin.',
  },
  off_hours_burst: {
    en: 'Investigate the off-hours bursts and confirm who initiated them.',
    az: 'İş saatlarından kənar əməliyyat partlayışlarını araşdırın və təşəbbüskarı müəyyən edin.',
  },
};

const GENERIC = {
  en: 'Spot-check a sample of flagged rows and document the outcome.',
  az: 'İşarələnmiş sətirlərdən nümunə yoxlaması aparın və nəticəni sənədləşdirin.',
};

const parse = <T>(content: string): T | null => {
  const json = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
  try {
    return json ? (JSON.parse(json) as T) : null;
  } catch {
    return null;
  }
};

/**
 * Deterministic stand-in for a real LLM: it calls the read-only tools, then submits a summary built
 * only from their outputs. Used in tests, CI and key-less demos; it never touches the network.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'mock-summarizer-1';

  async complete(
    messages: ChatMessage[],
    _tools: ToolDefinition[],
    options: CompletionOptions,
  ): Promise<LLMResponse> {
    const usage = { inputTokens: JSON.stringify(messages).length / 4, outputTokens: 200 };
    const results = messages.flatMap((m) => (m.role === 'tool_results' ? m.results : []));
    const respond = (toolCalls: LLMResponse['toolCalls']): LLMResponse => ({
      text: '',
      toolCalls,
      stopReason: 'tool_use',
      usage: { inputTokens: Math.round(usage.inputTokens), outputTokens: usage.outputTokens },
      model: this.model,
      native: toolCalls,
    });

    if (results.length === 0) {
      return respond([
        { id: 'mock_1', name: 'get_workbook_overview', input: {} },
        { id: 'mock_2', name: 'get_anomalies', input: { limit: 10 } },
      ]);
    }

    const overview = parse<Overview>(results[0]?.content ?? '') ?? { sheets: [], severityCounts: {} };
    const anomalies = parse<{ anomalies: AnomalyLite[] }>(results[1]?.content ?? '')?.anomalies ?? [];
    const az = /language:\s*az\b/.test(options.system);
    const lang = az ? 'az' : 'en';
    const rows = overview.sheets.reduce((n, s) => n + s.rowCount, 0);
    const high = overview.severityCounts.HIGH ?? 0;

    const summary = {
      headline: az
        ? `${overview.sheets.length} vərəq və ${rows} sətir təhlil edildi; ${anomalies.length} anomaliya, onlardan ${high} yüksək riskli.`
        : `Analysed ${overview.sheets.length} sheet(s) with ${rows} rows; ${anomalies.length} anomalies found, ${high} of them high severity.`,
      keyMetrics: overview.sheets.flatMap((s) =>
        (s.amountTotals ?? []).map((t) => ({
          label: az ? `${s.name}: ${t.column} cəmi` : `${s.name}: total ${t.column}`,
          value: String(t.sum),
        })),
      ),
      trends: [],
      risks: anomalies.filter((a) => a.severity === 'HIGH').map((a) => a.description),
      anomalyHighlights: anomalies.slice(0, 5).map((a) => ({ anomalyId: a.id, comment: a.description })),
      recommendations: [...new Set(anomalies.map((a) => (RECOMMENDATIONS[a.type] ?? GENERIC)[lang]))].slice(
        0,
        5,
      ),
      caveats: [
        az
          ? 'Bu xülasə test rejimində deterministik şablonla hazırlanıb.'
          : 'This summary was produced by the deterministic mock provider.',
      ],
    };
    return respond([{ id: 'mock_3', name: 'submit_summary', input: summary }]);
  }
}
