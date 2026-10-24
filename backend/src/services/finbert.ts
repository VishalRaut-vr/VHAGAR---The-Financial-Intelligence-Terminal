import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { SentimentCache } from '../models/SentimentCache.js';
export type Sentiment = { status:'success'; model:string; analyzedText:string; label:'positive'|'negative'|'neutral'; confidence:number; probabilities:Array<{label:'positive'|'negative'|'neutral';score:number}> };
const inFlight = new Map<string, Promise<Sentiment>>();

function isValidAnalyticalText(text: string): { valid: boolean; reason?: string } {
  const s = text.trim();
  if (!s) return { valid: false, reason: 'Text is empty or whitespace-only.' };
  if (s.length < 2) return { valid: false, reason: 'Input is too short for meaningful sentiment analysis.' };
  const words = s.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const meaningful = words.filter(w => w.length > 1 && /[a-zA-Z]/.test(w));
  if (meaningful.length < 2 && words.length < 3) {
    return { valid: false, reason: 'Please provide at least two meaningful words for analysis.' };
  }
  if (meaningful.length >= 3) {
    const counts = new Map<string, number>();
    for (const w of meaningful) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) || 0) + 1);
    const max = Math.max(...Array.from(counts.values()));
    if (max / meaningful.length > 0.75) return { valid: false, reason: 'Input appears repetitive or low-information.' };
  }
  return { valid: true };
}

function cleanFinancialText(text:string){return text.replace(/\s+/g,' ').trim().slice(0,6000);}
async function requestInference(text: string): Promise<Sentiment> {
  if (!env.FINBERT_SERVICE_URL) throw new Error('FinBERT service URL is not configured.');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${env.FINBERT_SERVICE_URL.replace(/\/$/,'')}/infer`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({text}), signal:controller.signal });
    if (!response.ok) throw new Error(response.status === 503 ? 'FinBERT model is not ready.' : `FinBERT inference failed (${response.status}).`);
    const raw = await response.json() as Sentiment & { analyzed_text?: string };
    const result: Sentiment = { ...raw, analyzedText: raw.analyzedText ?? raw.analyzed_text ?? text };
    if (result.status !== 'success' || result.model !== env.FINBERT_MODEL_ID || !['positive','negative','neutral'].includes(result.label) || !Number.isFinite(result.confidence)) throw new Error('FinBERT returned invalid inference metadata.');
    const total = result.probabilities?.reduce((sum,p)=>sum+p.score,0) ?? 0;
    if (!result.probabilities?.length || Math.abs(total-1)>0.02) throw new Error('FinBERT returned invalid class probabilities.');
    return result;
  } finally { clearTimeout(timeout); }
}
export async function analyzeSentiment(text: string): Promise<Sentiment> { const v = isValidAnalyticalText(text); if (!v.valid) throw new Error(v.reason || 'Invalid analytical text.'); return requestInference(cleanFinancialText(text)); }
export async function analyzeSentimentCached(text:string):Promise<Sentiment>{
  const analyzedText=cleanFinancialText(text); if(!analyzedText) throw new Error('Cannot analyze empty financial text.');
  const contentHash=createHash('sha256').update(analyzedText).digest('hex'); const expectedModel=env.FINBERT_MODEL_ID; const cacheKey=`${contentHash}:${expectedModel}`;
  const cached=await SentimentCache.findOne({cacheKey,expiresAt:{$gt:new Date()}}).lean();
  if(cached) return {status:'success',model:cached.modelVersion,analyzedText:cached.analyzedText,label:cached.label as Sentiment['label'],confidence:cached.confidence,probabilities:cached.probabilities.map(p=>({label:p.label as Sentiment['label'],score:p.score}))};
  const existing=inFlight.get(cacheKey); if(existing) return existing;
  const task=(async()=>{const result=await requestInference(analyzedText);const doc={cacheKey,contentHash,modelVersion:result.model,analyzedText:result.analyzedText,label:result.label,confidence:result.confidence,probabilities:result.probabilities,expiresAt:new Date(Date.now()+90*24*60*60*1000)};
    try{await SentimentCache.findOneAndUpdate({cacheKey},{$set:doc},{upsert:true,new:true,setDefaultsOnInsert:true});}catch(error){if(!(typeof error==='object'&&error!==null&&'code'in error&&error.code===11000))throw error;}
    return result;})();
  inFlight.set(cacheKey,task); try{return await task;}finally{inFlight.delete(cacheKey);}
}
