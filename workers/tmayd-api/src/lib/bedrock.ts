import { AwsClient } from "aws4fetch";
import type { Env, ModerationResult } from "../types";
import { MODERATION_VERSION } from "../types";

const GENERIC_HARD_MESSAGE =
  "This message cannot be accepted. Please submit a non-identifying reflection about your day.";

/**
 * Bedrock Guardrails ApplyGuardrail response surface that we actually read.
 * Full reference: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ApplyGuardrail.html
 */
interface ApplyGuardrailResponse {
  action?: "GUARDRAIL_INTERVENED" | "NONE";
  outputs?: Array<{ text?: string }>;
  assessments?: Array<{
    topicPolicy?: { topics?: Array<{ name?: string; type?: string; action?: string }> };
    contentPolicy?: {
      filters?: Array<{ type?: string; confidence?: string; action?: string }>;
    };
    sensitiveInformationPolicy?: {
      piiEntities?: Array<{ type?: string; action?: string }>;
      regexes?: Array<{ name?: string; action?: string }>;
    };
    wordPolicy?: {
      customWords?: Array<{ match?: string; action?: string }>;
      managedWordLists?: Array<{ type?: string; action?: string }>;
    };
  }>;
}

export function bedrockConfigured(env: Env): boolean {
  return Boolean(
    env.BEDROCK_GUARDRAIL_ID &&
      env.AWS_ACCESS_KEY_ID &&
      env.AWS_SECRET_ACCESS_KEY &&
      env.AWS_REGION
  );
}

/**
 * `_fetcher` is injected only for unit tests. Production uses `fetch` via
 * aws4fetch's signed client.
 */
export async function bedrockModerate(
  text: string,
  env: Env,
  _fetcher?: typeof fetch
): Promise<ModerationResult> {
  if (!bedrockConfigured(env)) {
    return {
      ok: false,
      kind: "hard",
      reason: "bedrock_not_configured",
      message: GENERIC_HARD_MESSAGE
    };
  }

  const region = env.AWS_REGION!;
  const guardrailId = env.BEDROCK_GUARDRAIL_ID!;
  const version = env.BEDROCK_GUARDRAIL_VERSION || "DRAFT";
  const url = `https://bedrock-runtime.${region}.amazonaws.com/guardrail/${guardrailId}/version/${version}/apply`;

  const body = JSON.stringify({
    source: "INPUT",
    content: [{ text: { text, qualifiers: ["query"] } }]
  });

  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    region,
    service: "bedrock"
  });

  let response: Response;
  try {
    if (_fetcher) {
      // Test path: caller intercepts fetch entirely; signing is not exercised
      // but the request shape (URL, body) is verifiable.
      response = await _fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      });
    } else {
      response = await aws.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      });
    }
  } catch (err) {
    return {
      ok: false,
      kind: "hard",
      reason: "bedrock_network_error",
      message: GENERIC_HARD_MESSAGE
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: "hard",
      reason: `bedrock_http_${response.status}`,
      message: GENERIC_HARD_MESSAGE
    };
  }

  let data: ApplyGuardrailResponse;
  try {
    data = (await response.json()) as ApplyGuardrailResponse;
  } catch {
    return {
      ok: false,
      kind: "hard",
      reason: "bedrock_bad_response",
      message: GENERIC_HARD_MESSAGE
    };
  }

  if (data.action === "GUARDRAIL_INTERVENED") {
    const reason = extractReason(data);
    return {
      ok: false,
      kind: "hard",
      reason,
      message: GENERIC_HARD_MESSAGE
    };
  }

  // Pass-through. Guardrail may have masked PII in `outputs[0].text` when
  // configured to MASK, but we don't trust that for our pipeline — the
  // deterministic layer already runs first and is the source of truth for
  // accepted_text. Bedrock here is a second-opinion gate, not a transformer.
  return {
    ok: true,
    cleaned: text,
    moderationVersion: `${MODERATION_VERSION}+bedrock`
  };
}

function extractReason(data: ApplyGuardrailResponse): string {
  const assessment = data.assessments?.[0];
  if (!assessment) return "bedrock_intervened";

  const pii = assessment.sensitiveInformationPolicy?.piiEntities?.find(
    (e) => e.action === "BLOCKED" || e.action === "ANONYMIZED"
  );
  if (pii?.type) return `pii_${pii.type.toLowerCase()}`;

  const regex = assessment.sensitiveInformationPolicy?.regexes?.find(
    (r) => r.action === "BLOCKED" || r.action === "ANONYMIZED"
  );
  if (regex?.name) return `regex_${regex.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

  const content = assessment.contentPolicy?.filters?.find((f) => f.action === "BLOCKED");
  if (content?.type) return `content_${content.type.toLowerCase()}`;

  const topic = assessment.topicPolicy?.topics?.find((t) => t.action === "BLOCKED");
  if (topic?.name) return `topic_${topic.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

  const word = assessment.wordPolicy?.customWords?.find((w) => w.action === "BLOCKED");
  if (word) return "blocklist_word";

  const managed = assessment.wordPolicy?.managedWordLists?.find((m) => m.action === "BLOCKED");
  if (managed?.type) return `managed_${managed.type.toLowerCase()}`;

  return "bedrock_intervened";
}
