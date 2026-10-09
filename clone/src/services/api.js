export const API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

// Valid Groq model — llama3-70b-8192 is stable and fast
export const DEFAULT_MODEL = "llama3-70b-8192";

export async function fetchChatCompletionStream(
  messages,
  onChunk,
  apiKey = API_KEY,
  model = DEFAULT_MODEL,
  signal = null
) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";

  const effectiveKey = apiKey || import.meta.env.VITE_GROQ_API_KEY;

  if (!effectiveKey) {
    throw new Error(
      "API Key is missing. Please set your Groq API Key in the .env file as VITE_GROQ_API_KEY."
    );
  }

  const systemMessage = {
    role: "system",
    content:
      "You are ChatGPT, a large language model trained by OpenAI. You are helpful, kind, accurate, and provide well-formatted answers using markdown syntax.",
  };

  const formattedMessages = [systemMessage, ...messages];

  // Internal controller so we can abort on stream error
  const internalController = new AbortController();
  const combinedSignal = signal
    ? anySignal([signal, internalController.signal])
    : internalController.signal;

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: formattedMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: combinedSignal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request was cancelled.");
    throw new Error(
      "Network error: Could not connect to Groq API. Please check your internet connection and try again."
    );
  }

  if (!response.ok) {
    let errorMsg = `API request failed (status ${response.status}).`;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error?.message || errorMsg;
    } catch (_) {}

    if (response.status === 401)
      errorMsg = "Invalid API key. Please check your VITE_GROQ_API_KEY in the .env file.";
    else if (response.status === 429)
      errorMsg = "Rate limit exceeded. Please wait a moment and try again.";
    else if (response.status === 503 || response.status === 502)
      errorMsg = "Groq server is temporarily unavailable. Please try again shortly.";

    throw new Error(errorMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let partialText = "";
  let buffer = "";

  try {
    while (true) {
      let done, value;
      try {
        ({ done, value } = await reader.read());
      } catch (_readErr) {
        // Network dropped mid-stream — return what we have
        if (partialText.trim().length > 0) {
          onChunk(partialText + "\n\n*(Connection interrupted — response may be incomplete.)*");
          return partialText;
        }
        throw new Error(
          "Connection was lost while receiving the response. Please check your internet and try again."
        );
      }

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]") return partialText;

        if (trimmed.startsWith("data: ")) {
          try {
            const jsonStr = trimmed.slice(6);
            const parsed = JSON.parse(jsonStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              partialText += deltaContent;
              onChunk(partialText);
            }
          } catch (_) {
            // ignore malformed chunks
          }
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  return partialText;
}

/** Returns a signal that aborts when ANY of the provided signals abort. */
function anySignal(signals) {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) { controller.abort(); break; }
    sig.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

