export const API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
export const DEFAULT_MODEL = "openai/gpt-oss-120b";

export async function fetchChatCompletionStream(messages, onChunk, apiKey = API_KEY, model = DEFAULT_MODEL) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";

  const effectiveKey = apiKey || import.meta.env.VITE_GROQ_API_KEY;

  if (!effectiveKey) {
    throw new Error("API Key is missing. Please set your Groq API Key in API Settings or .env file.");
  }

  const systemMessage = {
    role: "system",
    content: "You are ChatGPT, a large language model trained by OpenAI. You are helpful, kind, accurate, and provide well-formatted answers using markdown syntax."
  };

  const formattedMessages = [systemMessage, ...messages];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${effectiveKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: formattedMessages,
      stream: true,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API Request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let partialText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;

      if (trimmed === "data: [DONE]") {
        break;
      }

      if (trimmed.startsWith("data: ")) {
        try {
          const jsonStr = trimmed.slice(6);
          const parsed = JSON.parse(jsonStr);
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (deltaContent) {
            partialText += deltaContent;
            onChunk(partialText);
          }
        } catch (err) {
          // ignore parse errors for partial chunks
        }
      }
    }
  }

  return partialText;
}
