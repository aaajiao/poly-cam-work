import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireAuth } from '../_lib/auth'
import { badRequest, methodNotAllowed, unauthorized } from '../_lib/http'

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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

  const response = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => {
      return {
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        addRandomSuffix: true,
      }
    },
    onUploadCompleted: async () => {
      return
    },
  })

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
