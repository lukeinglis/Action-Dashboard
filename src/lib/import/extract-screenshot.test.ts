import { describe, expect, it, vi } from "vitest";
import { extractScreenshotText } from "./extract-screenshot";

function fakeFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ content: [{ type: "text", text: "Bet Slip #DK-1\n..." }] }),
    ...response,
  } as Response);
}

describe("extractScreenshotText", () => {
  it("sends the image as a base64 content block with the api key and version headers", async () => {
    const fetchImpl = fakeFetch({});

    await extractScreenshotText({
      apiKey: "sk-test",
      imageBase64: "AAAA",
      mediaType: "image/png",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init!.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    expect((init!.headers as Record<string, string>)["anthropic-version"]).toBeTruthy();

    const body = JSON.parse(init!.body as string);
    expect(body.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    });
  });

  it("returns the transcribed text from the response", async () => {
    const fetchImpl = fakeFetch({
      json: async () => ({ content: [{ type: "text", text: "Bet Slip #DK-1\nType: Straight" }] }),
    });

    const text = await extractScreenshotText({
      apiKey: "sk-test",
      imageBase64: "AAAA",
      mediaType: "image/png",
      fetchImpl,
    });

    expect(text).toBe("Bet Slip #DK-1\nType: Straight");
  });

  it("throws with the status and body on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "invalid x-api-key",
    } as Response);

    await expect(
      extractScreenshotText({ apiKey: "bad", imageBase64: "AAAA", mediaType: "image/png", fetchImpl }),
    ).rejects.toThrow(/401/);
  });

  it("throws when the response has no text content", async () => {
    const fetchImpl = fakeFetch({ json: async () => ({ content: [] }) });

    await expect(
      extractScreenshotText({ apiKey: "sk-test", imageBase64: "AAAA", mediaType: "image/png", fetchImpl }),
    ).rejects.toThrow(/no transcribed text/);
  });
});
