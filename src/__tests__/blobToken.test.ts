import { afterEach, describe, expect, it } from "vitest";
import {
	BLOB_READ_WRITE_TOKEN_ENV_NAME,
	getBlobReadWriteToken,
	LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME,
	readBlobReadWriteToken,
} from "../../api/_lib/blobToken";

const originalProjectToken = process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME];
const originalLegacyToken = process.env[LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME];

function restoreEnv() {
	if (originalProjectToken === undefined) {
		delete process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME];
	} else {
		process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME] = originalProjectToken;
	}

	if (originalLegacyToken === undefined) {
		delete process.env[LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME];
	} else {
		process.env[LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME] = originalLegacyToken;
	}
}

describe("blob token helper", () => {
	afterEach(() => {
		restoreEnv();
	});

	it("prefers the project-specific blob token env var", () => {
		process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME] = "project-token";
		process.env[LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME] = "legacy-token";

		expect(readBlobReadWriteToken()).toBe("project-token");
		expect(getBlobReadWriteToken()).toBe("project-token");
	});

	it("falls back to the legacy blob token env var", () => {
		delete process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME];
		process.env[LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME] = "legacy-token";

		expect(readBlobReadWriteToken()).toBe("legacy-token");
	});

	it("throws a helpful error when neither env var is configured", () => {
		delete process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME];
		delete process.env[LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME];

		expect(() => getBlobReadWriteToken()).toThrow(
			`Blob token is not configured. Set ${BLOB_READ_WRITE_TOKEN_ENV_NAME} (preferred) or ${LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME} (legacy fallback).`,
		);
	});
});
