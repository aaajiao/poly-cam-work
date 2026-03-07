import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireAuth } from '../_lib/auth'
import { badRequest, methodNotAllowed, unauthorized } from '../_lib/http'

const ALLOWED_MODEL_CONTENT_TYPES = [
  'model/gltf-binary',
  'model/gltf+json',
  'application/octet-stream',
  'application/gltf-buffer',
  'text/plain',
]

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  if (!requireAuth(request)) {
    return unauthorized()
  }

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null
  if (!body) {
    return badRequest('Invalid upload body')
  }

  let response: Awaited<ReturnType<typeof handleUpload>>
  try {
    response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ALLOWED_MODEL_CONTENT_TYPES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        return
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create upload token'
    return badRequest(message)
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
