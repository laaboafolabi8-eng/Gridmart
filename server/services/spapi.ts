import crypto from 'crypto';

const MARKETPLACE_ID = 'A2EUQ1WTGCTBG2'; // Canada
const SP_API_HOST = 'sellingpartnerapi-na.amazon.com';
const AWS_REGION = 'us-east-1';
const AWS_SERVICE = 'execute-api';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getLWAAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.AMAZON_LWA_REFRESH_TOKEN!,
      client_id: process.env.AMAZON_LWA_CLIENT_ID!,
      client_secret: process.env.AMAZON_LWA_CLIENT_SECRET!,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LWA token exchange failed: ${res.status} ${text}`);
  }

  const data: any = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hash(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function getSigningKey(secretKey: string, dateStamp: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, AWS_REGION);
  const kService = hmacSha256(kRegion, AWS_SERVICE);
  return hmacSha256(kService, 'aws4_request');
}

function buildAuthHeaders(
  method: string,
  path: string,
  queryString: string,
  accessToken: string,
): Record<string, string> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY!;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders =
    `host:${SP_API_HOST}\n` +
    `x-amz-access-token:${accessToken}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaderNames = 'host;x-amz-access-token;x-amz-date';

  const canonicalRequest = [
    method,
    path,
    queryString,
    canonicalHeaders,
    signedHeaderNames,
    sha256Hash(''),
  ].join('\n');

  const credentialScope = `${dateStamp}/${AWS_REGION}/${AWS_SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hash(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretKey, dateStamp);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    'x-amz-date': amzDate,
    'x-amz-access-token': accessToken,
    host: SP_API_HOST,
  };
}

export interface EligibilityResult {
  asin: string;
  eligible: boolean;
  reasons: string[];
  error?: string;
}

const REASON_LABELS: Record<string, string> = {
  FBA_INB_0004: 'Requires approval to list',
  FBA_INB_0197: 'Hazmat review required',
  FBA_INB_0008: 'Listing restricted',
  FBA_INB_0009: 'Category restricted',
  FBA_INB_0010: 'Brand restricted',
  FBA_INB_0011: 'Used item restriction',
  FBA_INB_0012: 'Expiration date required',
  FBA_INB_0013: 'Cannot be listed on Amazon',
  FBA_INB_0014: 'Adult product restriction',
};

export async function checkEligibility(asin: string): Promise<EligibilityResult> {
  try {
    const accessToken = await getLWAAccessToken();

    const path = '/fba/inbound/v1/eligibility/itemPreview';
    const params = new URLSearchParams({
      asin,
      program: 'INBOUND',
      marketplaceIds: MARKETPLACE_ID,
    });
    const queryString = params.toString();

    const headers = buildAuthHeaders('GET', path, queryString, accessToken);

    const res = await fetch(`https://${SP_API_HOST}${path}?${queryString}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SP-API ${res.status}: ${text}`);
    }

    const data: any = await res.json();
    const payload = data.payload;

    return {
      asin,
      eligible: payload.isEligibleForProgram,
      reasons: (payload.ineligibilityReasonList || []).map(
        (code: string) => REASON_LABELS[code] || code,
      ),
    };
  } catch (err: any) {
    return { asin, eligible: false, reasons: [], error: err.message };
  }
}
