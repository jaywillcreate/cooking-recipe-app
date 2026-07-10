import { route, requireUser, json, forbidden } from '@/lib/server/http';
import { config } from '@/lib/server/config';
import { emailConfigured } from '@/lib/server/services/email';
import { testGeminiImage, testBlobWrite } from '@/lib/server/services/images';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** Admin-only config diagnostics (booleans only — never leaks secret values). */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  if (u.role !== 'admin') throw forbidden('Admin only');

  // ?test=image runs the live pipeline: one Gemini generation + one Blob write.
  const runTest = req.nextUrl.searchParams.get('test') === 'image';
  const [liveTest, blobTest] = runTest ? await Promise.all([testGeminiImage(), testBlobWrite()]) : [undefined, undefined];

  return json({
    email: {
      provider: config.emailProvider,
      configured: emailConfigured(),
      hasBrevoKey: !!config.brevoApiKey,
      hasResendKey: !!config.resendApiKey,
      from: config.emailFrom,
    },
    images: {
      geminiEnabled: config.geminiEnabled,
      geminiModel: config.geminiImageModel,
      hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
      hasPollinationsToken: !!config.pollinationsToken,
      pollinationsReferrer: config.pollinationsReferrer,
      ...(liveTest ? { geminiLiveTest: liveTest } : {}),
      ...(blobTest ? { blobWriteTest: blobTest } : {}),
    },
    appOrigin: config.appOrigin,
    cronSecretSet: !!config.cronSecret,
    googleEnabled: config.googleEnabled,
  });
});
