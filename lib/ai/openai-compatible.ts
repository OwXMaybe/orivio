import { z } from "zod";
import { AIProviderError, type AIProvider, type JsonRequest } from "./types";

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

/** Adapter for any provider exposing a /chat/completions endpoint with JSON mode. */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;

  constructor(private apiKey: string, private baseUrl: string, private model: string) {
    this.name = `openai-compatible:${model}`;
  }

  async generateJson<T>({ system, prompt, schema, maxTokens = 8000 }: JsonRequest<T>): Promise<T> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\n\nRespond with a single JSON object matching this JSON Schema:\n${jsonSchema}` },
          { role: "user", content: prompt },
        ],
      }),
    }).catch(() => {
      throw new AIProviderError("AI provider request failed.", true);
    });

    if (!response.ok) throw new AIProviderError(`AI provider error (${response.status}).`, response.status >= 429);
    const completion = completionSchema.safeParse(await response.json().catch(() => null));
    const content = completion.success ? completion.data.choices[0].message.content : null;
    if (!content) throw new AIProviderError("AI provider returned an empty response.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AIProviderError("AI response was not valid JSON.");
    }
    const result = schema.safeParse(parsed);
    if (!result.success) throw new AIProviderError("The AI response did not match the expected structure.");
    return result.data;
  }
}
