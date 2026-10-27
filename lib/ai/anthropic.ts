import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AIProviderError, type AIProvider, type JsonRequest } from "./types";

export class AnthropicProvider implements AIProvider {
  readonly name: string;
  private client: Anthropic;

  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
    this.name = `anthropic:${model}`;
  }

  async generateJson<T>({ system, prompt, schema, maxTokens = 16000 }: JsonRequest<T>): Promise<T> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        system,
        output_config: { format: zodOutputFormat(schema), effort: "medium" },
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") {
        throw new AIProviderError("The AI provider declined this request.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new AIProviderError("The AI response was cut off before completion.", true);
      }
      if (response.parsed_output == null) {
        throw new AIProviderError("The AI response did not match the expected structure.");
      }
      return response.parsed_output as T;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Anthropic.AuthenticationError) throw new AIProviderError("AI provider rejected the API key.");
      if (error instanceof Anthropic.RateLimitError) throw new AIProviderError("AI provider rate limit reached.", true);
      if (error instanceof Anthropic.APIError) throw new AIProviderError(`AI provider error (${error.status ?? "network"}).`, true);
      throw new AIProviderError("AI provider request failed.", true);
    }
  }
}
