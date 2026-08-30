import { afterEach, describe, expect, it, vi } from "vitest";
import { getDraft } from "@/lib/publishApi";
import type { SceneDraft } from "@/types";

const draft: SceneDraft = {
	sceneId: "scan-b",
	revision: 3,
	annotations: [],
	updatedAt: 123,
};

function mockDraftResponse(headers?: HeadersInit) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(
			new Response(JSON.stringify(draft), {
				status: 200,
				headers,
			}),
		),
	);
}

describe("publishApi draft ETag", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps a missing ETag header unknown for legacy API compatibility", async () => {
		mockDraftResponse();

		const result = await getDraft("scan-b");

		expect(result.draftEtag).toBeUndefined();
	});

	it("maps an empty ETag header to a confirmed absent draft", async () => {
		mockDraftResponse({ "X-Draft-ETag": "" });

		const result = await getDraft("scan-b");

		expect(result.draftEtag).toBeNull();
	});

	it("returns a present draft ETag unchanged", async () => {
		mockDraftResponse({ "X-Draft-ETag": "etag-scan-b-3" });

		const result = await getDraft("scan-b");

		expect(result.draftEtag).toBe("etag-scan-b-3");
	});
});
