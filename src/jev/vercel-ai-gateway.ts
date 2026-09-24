import { createGateway, experimental_evaluate as evaluate } from 'ai';
import type { JevProvider, JevProviderOptions } from './contract.js';
import { interpretEvaluation, isSchemaRejected, unavailable } from './normalize.js';
import { summarizeState } from './questions.js';

export function createVercelAiGatewayProvider(options: JevProviderOptions): JevProvider {
  const evaluateImpl =
    options.evaluateImpl ?? (evaluate as NonNullable<JevProviderOptions['evaluateImpl']>);
  const modelId = options.model || 'typesafe-ai/jev';
  return {
    id: 'vercel-ai-gateway',
    async evaluateFailure(request) {
      if (!options.apiKey) {
        return unavailable('AI_GATEWAY_API_KEY is required for vercel-ai-gateway');
      }
      try {
        const gateway = createGateway({ apiKey: options.apiKey });
        const result = await evaluateImpl({
          model: gateway.evaluationModel(modelId as never),
          state: summarizeState(request.state) as unknown as Record<string, unknown>,
          questions: request.questions,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(options.timeoutMs),
          providerOptions: {
            gateway: { zeroDataRetention: true },
          },
        });
        return interpretEvaluation({
          answers: result.answers,
          providerMetadata: result.providerMetadata,
        });
      } catch (error) {
        if (isSchemaRejected(error)) {
          return {
            status: 'schema_rejected',
            message: error instanceof Error ? error.message : String(error),
          };
        }
        const message = error instanceof Error ? error.message : String(error);
        return unavailable(`vercel-ai-gateway error: ${message}`);
      }
    },
  };
}
