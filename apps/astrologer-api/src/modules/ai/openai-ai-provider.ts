import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import {
  createOpenAiProvider,
  type AiGenerationPort,
  type OpenAiClient,
  type OpenAiRuntimeConfig
} from "@elevenhouse/ai";
import { AI_OPENAI_CLIENT } from "./ai.tokens";

export type { OpenAiClient } from "@elevenhouse/ai";
export {
  AiProviderAuthenticationError,
  AiProviderBadRequestError,
  AiProviderBillingError,
  AiProviderIncompleteResponseError,
  AiProviderRateLimitError,
  AiProviderRefusalError,
  AiProviderResponseFormatError,
  AiProviderServerError,
  AiProviderTimeoutError,
  AiProviderUnavailableError
} from "@elevenhouse/ai";

@Injectable()
export class OpenAiProvider implements AiGenerationPort {
  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(AI_OPENAI_CLIENT) private readonly injectedClient?: OpenAiClient
  ) {}

  generateStructured: AiGenerationPort["generateStructured"] = (input) =>
    createOpenAiProvider({
      getConfig: () => this.configService.getOrThrow<OpenAiRuntimeConfig>("astrologerApi.ai"),
      client: this.injectedClient ?? this.createClient()
    }).generateStructured(input);

  private createClient(): OpenAiClient {
    const config = this.configService.getOrThrow<OpenAiRuntimeConfig>("astrologerApi.ai");
    return new OpenAI({
      apiKey: config.openAiApiKey,
      baseURL: config.openAiBaseUrl,
      timeout: config.timeoutMs
    }) as unknown as OpenAiClient;
  }
}
