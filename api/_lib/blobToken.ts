export const BLOB_READ_WRITE_TOKEN_ENV_NAME = "POLYCAM_BLOB_READ_WRITE_TOKEN";
export const LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME = "BLOB_READ_WRITE_TOKEN";

export function readBlobReadWriteToken() {
	return (
		process.env[BLOB_READ_WRITE_TOKEN_ENV_NAME] ??
		process.env[LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME] ??
		null
	);
}

export function getBlobReadWriteToken() {
	const token = readBlobReadWriteToken();
	if (!token) {
		throw new Error(
			`Blob token is not configured. Set ${BLOB_READ_WRITE_TOKEN_ENV_NAME} (preferred) or ${LEGACY_BLOB_READ_WRITE_TOKEN_ENV_NAME} (legacy fallback).`,
		);
	}

	return token;
}
