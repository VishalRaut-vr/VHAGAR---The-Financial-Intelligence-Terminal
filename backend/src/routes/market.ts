import { Router } from 'express';
import { z } from 'zod';
import { getCandles, getProfile, getQuote, searchSymbols } from '../services/marketData.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const marketRouter = Router();
const symbolSchema = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.^_-]+$/);
marketRouter.get('/search', async (req,res,next)=>{ try { const q=z.string().trim().min(1).max(80).parse(req.query.q); res.json({results:await searchSymbols(q)}); } catch(e){next(e);} });
marketRouter.get('/nse-stocks', async (req, res, next) => {
  try {
    const q = z.string().trim().min(1).max(80).parse(req.query.q).toLowerCase();
    const filePath = path.resolve(process.cwd(), 'data', 'nse-equities.json');
    const raw = await readFile(filePath, 'utf8');
    const stocks = z.array(z.object({
      symbol: z.string(),
      name: z.string(),
      series: z.string()
    })).parse(JSON.parse(raw));

    const results = stocks
      .filter(stock =>
        stock.series === 'EQ' &&
        (stock.symbol.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q))
      )
      .slice(0, 50)
      .map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        type: 'NSE Equity'
      }));

    res.json({ results, count: results.length, source: 'NSE equity master' });
  } catch (e) {
    next(e);
  }
});

marketRouter.get('/quote/:symbol', async (req,res,next)=>{ try { const symbol=symbolSchema.parse(req.params.symbol); res.json({quote:await getQuote(symbol)}); } catch(e){next(e);} });
marketRouter.get('/quotes', async (req,res,next)=>{ try { const symbols=z.string().default('AAPL,MSFT,NVDA').transform(v=>v.split(',').map(s=>s.trim()).filter(Boolean).slice(0,10)).parse(req.query.symbols); const results=await Promise.allSettled(symbols.map(s=>getQuote(symbolSchema.parse(s)))); res.json({quotes:results.map((r,i)=>r.status==='fulfilled'?r.value:{symbol:symbols[i],error:'Quote unavailable'}),asOf:new Date().toISOString()}); } catch(e){next(e);} });
marketRouter.get('/history/:symbol', async (req,res,next)=>{ try { const symbol=symbolSchema.parse(req.params.symbol); const days=z.coerce.number().int().min(1).max(3650).default(90).parse(req.query.days); const resolution=z.enum(['1','5','15','30','60','D','W','M']).default('D').parse(req.query.resolution); res.json({symbol,interval:resolution,candles:await getCandles(symbol,resolution,days),source:'Finnhub'}); } catch(e){next(e);} });
marketRouter.get('/company/:symbol', async(req,res,next)=>{try{res.json({company:await getProfile(symbolSchema.parse(req.params.symbol))});}catch(e){next(e);}});


