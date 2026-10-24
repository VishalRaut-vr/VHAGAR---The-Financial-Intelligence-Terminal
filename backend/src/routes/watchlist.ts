import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { Watchlist } from '../models/Watchlist.js';
import { getQuote } from '../services/marketData.js';
export const watchlistRouter=Router(); watchlistRouter.use(requireAuth);
const symbol=z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9.^_-]+$/);
function uid(req:any){return (req as AuthenticatedRequest).userId as mongoose.Types.ObjectId;}
watchlistRouter.get('/',async(req,res,next)=>{try{const list=await Watchlist.findOne({user:uid(req)}).lean(); const symbols=list?.symbols??[]; const quotes=await Promise.all(symbols.map(async s=>{try{return await getQuote(s);}catch{return {symbol:s,unavailable:true};}}));res.json({symbols,quotes});}catch(e){next(e);}});
watchlistRouter.post('/',async(req,res,next)=>{try{const parsed=z.object({symbol}).strict().safeParse(req.body);if(!parsed.success){res.status(400).json({error:'VALIDATION_ERROR',message:'Provide a valid stock symbol.'});return;}const user=uid(req);const existing=await Watchlist.findOne({user});if(existing?.symbols.includes(parsed.data.symbol)){res.json({symbols:existing.symbols});return;}if((existing?.symbols.length??0)>=100){res.status(409).json({error:'WATCHLIST_LIMIT',message:'A watchlist can contain at most 100 symbols.'});return;}const list=await Watchlist.findOneAndUpdate({user},{$addToSet:{symbols:parsed.data.symbol}},{upsert:true,new:true,setDefaultsOnInsert:true,runValidators:true});res.status(201).json({symbols:list.symbols});}catch(e){next(e);}});
watchlistRouter.delete('/:symbol',async(req,res,next)=>{try{const s=symbol.parse(req.params.symbol);const list=await Watchlist.findOneAndUpdate({user:uid(req)},{$pull:{symbols:s}},{new:true});res.json({symbols:list?.symbols??[]});}catch(e){next(e);}});
