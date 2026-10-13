import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleApi } from '../../../lib/core.mjs';
export const dynamic = 'force-dynamic';
async function handler(request:Request){return handleApi(request,{db:env.DB,bucket:env.BUCKET,user:await getChatGPTUser(),local:false})}
export const GET=handler;export const POST=handler;export const PUT=handler;export const PATCH=handler;export const DELETE=handler;
