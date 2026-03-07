import { list, put } from '@vercel/blob'

async function getBlobUrlByPath(pathname: string) {
  const { blobs } = await list({
    prefix: pathname,
    limit: 100,
  })

  const exact = blobs.find((blob) => blob.pathname === pathname)
  return exact?.url ?? null
}

export async function readJsonBlob<T>(pathname: string): Promise<T | null> {
  const url = await getBlobUrlByPath(pathname)
  if (!url) return null
  const response = await fetch(url)
  if (!response.ok) return null
  return (await response.json()) as T
}

export async function writeJsonBlob(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
}

export async function writeImmutableJsonBlob(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/json',
  })
}
