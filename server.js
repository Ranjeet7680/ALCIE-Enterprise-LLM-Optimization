require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-Memory State ─────────────────────────────────────────────────────────
let sessions = {};          // sessionId → { history, budget, spent, model }
let globalMetrics = {
  totalQueries: 0,
  totalTokensSaved: 0,
  totalCostSaved: 0,
  modelDistribution: { gpt4: 0, gpt35: 0, claude: 0, gemini: 0 },
  queryLog: [],             // last 50 entries
  hourlyUsage: new Array(24).fill(0),
  dailyCosts: [],
  promptLibrary: {},        // learned optimal prompts
  accuracyScores: [],
};

// ─── Pricing Table (USD per 1K tokens) ────────────────────────────────────────
const PRICING = {
  'gpt-4o':          { input: 0.005,  output: 0.015  },
  'gpt-3.5-turbo':   { input: 0.0005, output: 0.0015 },
  'claude-3-opus':   { input: 0.015,  output: 0.075  },
  'claude-3-haiku':  { input: 0.00025,output: 0.00125},
  'gemini-1.5-pro':  { input: 0.0035, output: 0.0105 },
  'gemini-1.5-flash':{ input: 0.00035,output: 0.00105},
};

// ─── Utility Functions ────────────────────────────────────────────────────────
function estimateTokens(text) {
  return Math.ceil(text.split(/\s+/).length * 1.35);
}

function computeCost(model, inputTokens, outputTokens) {
  const p = PRICING[model] || { input: 0.001, output: 0.003 };
  return ((inputTokens / 1000) * p.input) + ((outputTokens / 1000) * p.output);
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

function simpleEmbed(text) {
  // Deterministic pseudo-embedding for demo
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/);
  const vec = new Array(64).fill(0);
  words.forEach((w, i) => {
    for (let c = 0; c < w.length; c++) {
      vec[(i * 7 + c * 13) % 64] += w.charCodeAt(c) / 1000;
    }
  });
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / mag);
}

// ─── 1. Intent Classifier ─────────────────────────────────────────────────────
function classifyIntent(query) {
  const q = query.toLowerCase();
  const keywords = {
    complex:    ['analyze', 'compare', 'explain', 'synthesize', 'reason', 'evaluate', 'debate', 'research', 'architecture', 'strategy'],
    medium:     ['summarize', 'describe', 'list', 'outline', 'generate', 'write', 'create', 'translate'],
    simple:     ['what', 'who', 'when', 'where', 'define', 'yes', 'no', 'is', 'are', 'how many'],
    code:       ['code', 'function', 'debug', 'implement', 'algorithm', 'api', 'sql', 'python', 'javascript'],
  };
  let scores = { complex: 0, medium: 0, simple: 0, code: 0 };
  for (const [k, kws] of Object.entries(keywords)) {
    kws.forEach(kw => { if (q.includes(kw)) scores[k] += 1; });
  }
  scores.complex += Math.floor(q.split(' ').length / 10);
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const complexity = { complex: 0.9, medium: 0.55, simple: 0.2, code: 0.7 }[top] || 0.5;
  return { type: top, complexity, scores };
}

// ─── 2. Model Router ─────────────────────────────────────────────────────────
function routeModel(complexity, budget, spent, userPreference) {
  if (userPreference && PRICING[userPreference]) return { model: userPreference, reason: 'User specified' };

  const remaining = budget - spent;
  const remainingPct = remaining / budget;

  if (remainingPct < 0.1) {
    return { model: 'gemini-1.5-flash', reason: '🚨 Budget critical — using cheapest model' };
  }
  if (remainingPct < 0.3) {
    return { model: complexity > 0.6 ? 'gpt-3.5-turbo' : 'gemini-1.5-flash', reason: '⚠️ Budget low — downgraded model' };
  }
  if (complexity > 0.8) return { model: 'gpt-4o', reason: '🧠 High complexity — GPT-4o selected' };
  if (complexity > 0.6) return { model: 'claude-3-opus', reason: '📚 Medium-high — Claude Opus selected' };
  if (complexity > 0.4) return { model: 'gemini-1.5-pro', reason: '⚡ Medium — Gemini Pro selected' };
  return { model: 'gemini-1.5-flash', reason: '💨 Simple query — Flash model used' };
}

// ─── 3. Knowledge Graph Builder ───────────────────────────────────────────────
function buildKnowledgeGraph(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const entities = new Set();
  const relations = [];

  // Simple NLP: extract subject-verb-object triples
  sentences.forEach(sent => {
    const words = sent.trim().split(/\s+/);
    if (words.length < 3) return;
    const verbs = ['is', 'are', 'uses', 'builds', 'creates', 'has', 'contains', 'provides', 'generates', 'runs', 'implements'];
    for (let i = 1; i < words.length - 1; i++) {
      const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
      if (verbs.includes(w)) {
        const subj = words.slice(Math.max(0, i-2), i).join(' ').replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const obj  = words.slice(i+1, Math.min(words.length, i+4)).join(' ').replace(/[^a-zA-Z0-9 ]/g, '').trim();
        if (subj && obj) {
          entities.add(subj); entities.add(obj);
          relations.push({ subject: subj, predicate: w, object: obj });
        }
      }
    }
  });

  // Build compressed context from graph
  const compressed = relations.map(r => `(${r.subject} → ${r.predicate} → ${r.object})`).join(' | ');
  const compressionRatio = text.length > 0 ? Math.min(0.85, 1 - (compressed.length / text.length)) : 0;

  return {
    entities: [...entities].slice(0, 20),
    relations: relations.slice(0, 15),
    compressed,
    compressionRatio: Math.max(0.3, compressionRatio),
    originalTokens: estimateTokens(text),
    compressedTokens: estimateTokens(compressed),
  };
}

// ─── 4. Semantic Memory (FAISS-like) ──────────────────────────────────────────
const memoryStore = [];  // { id, text, embedding, timestamp }

function semanticSearch(query, k = 3) {
  if (memoryStore.length === 0) return [];
  const qEmbed = simpleEmbed(query);
  return memoryStore
    .map(m => ({ ...m, score: cosineSimilarity(qEmbed, m.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter(m => m.score > 0.3);
}

function addToMemory(text, id) {
  if (memoryStore.length > 100) memoryStore.shift();
  memoryStore.push({ id: id || uuidv4(), text: text.slice(0, 500), embedding: simpleEmbed(text), timestamp: Date.now() });
}

// ─── 5. Prompt Optimizer (RL-style) ───────────────────────────────────────────
function optimizePrompt(query, memoryContext) {
  const variations = [
    query,
    `Be concise. ${query}`,
    `Answer in 2-3 sentences: ${query}`,
    query.replace(/\bplease\b/gi, '').replace(/\bcould you\b/gi, '').trim(),
    `[BRIEF] ${query}`,
  ];

  const key = query.slice(0, 50);
  if (globalMetrics.promptLibrary[key]) {
    return { optimized: globalMetrics.promptLibrary[key].best, source: 'learned', tokensSaved: globalMetrics.promptLibrary[key].saved };
  }

  // Pick shortest effective variation
  const scored = variations.map(v => ({ text: v, tokens: estimateTokens(v) }));
  scored.sort((a, b) => a.tokens - b.tokens);
  const best = scored[0];

  // Add memory context if relevant
  let finalPrompt = best.text;
  if (memoryContext && memoryContext.length > 0) {
    const ctx = memoryContext.map(m => m.text.slice(0, 80)).join(' | ');
    finalPrompt = `Context: ${ctx}\n\n${best.text}`;
  }

  const saved = estimateTokens(query) - estimateTokens(finalPrompt);
  globalMetrics.promptLibrary[key] = { best: finalPrompt, saved: Math.max(0, saved), uses: 1 };

  return { optimized: finalPrompt, source: 'optimizer', tokensSaved: Math.max(0, saved) };
}

// ─── 6. Cost Forecaster (Exponential Smoothing) ───────────────────────────────
function forecastCosts(dailyCosts) {
  if (dailyCosts.length === 0) return { next7Days: [], confidence: 0 };
  const alpha = 0.3;
  let smoothed = dailyCosts[0].cost;
  dailyCosts.forEach(d => { smoothed = alpha * d.cost + (1 - alpha) * smoothed; });

  const trend = dailyCosts.length > 1
    ? (dailyCosts[dailyCosts.length - 1].cost - dailyCosts[0].cost) / dailyCosts.length
    : 0;

  const next7Days = Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    predicted: Math.max(0, smoothed + trend * (i + 1) + (Math.random() - 0.5) * smoothed * 0.1),
    label: new Date(Date.now() + (i + 1) * 86400000).toLocaleDateString('en-US', { weekday: 'short' }),
  }));

  return { next7Days, confidence: Math.min(0.95, 0.5 + dailyCosts.length * 0.05), trend };
}

// ─── 7. Multi-Agent Orchestrator ──────────────────────────────────────────────
function runMultiAgent(query, session) {
  const agentLog = [];

  // Planner Agent
  const intent = classifyIntent(query);
  agentLog.push({ agent: 'Planner', action: `Classified as "${intent.type}" (complexity: ${(intent.complexity*100).toFixed(0)}%)`, icon: '🧠' });

  // Compression Agent
  const kgResult = query.length > 100 ? buildKnowledgeGraph(query) : null;
  agentLog.push({ agent: 'Compression', action: kgResult
    ? `Knowledge graph: ${kgResult.relations.length} relations, ${(kgResult.compressionRatio*100).toFixed(0)}% reduction`
    : 'Query short — compression skipped', icon: '✂️' });

  // Memory Agent
  const memories = semanticSearch(query);
  agentLog.push({ agent: 'Memory', action: memories.length > 0
    ? `Found ${memories.length} relevant memories (avg similarity: ${(memories[0].score*100).toFixed(0)}%)`
    : 'No relevant memories found', icon: '🧩' });

  // Prompt Optimizer
  const promptResult = optimizePrompt(query, memories);
  agentLog.push({ agent: 'Optimizer', action: `Prompt optimized, saved ${promptResult.tokensSaved} tokens (source: ${promptResult.source})`, icon: '⚡' });

  // Cost Agent
  const routing = routeModel(intent.complexity, session.budget, session.spent, session.model);
  agentLog.push({ agent: 'Cost', action: `${routing.reason}`, icon: '💰' });

  // Router Agent
  const inputTokens = estimateTokens(promptResult.optimized);
  const outputTokens = Math.ceil(inputTokens * (0.5 + intent.complexity * 1.5));
  const cost = computeCost(routing.model, inputTokens, outputTokens);
  const originalCost = computeCost(routing.model, estimateTokens(query) * 2, estimateTokens(query) * 3);
  agentLog.push({ agent: 'Router', action: `Route to ${routing.model} | ${inputTokens}→${outputTokens} tokens | $${cost.toFixed(5)}`, icon: '🎯' });

  return { intent, kgResult, memories, promptResult, routing, inputTokens, outputTokens, cost, originalCost, agentLog };
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// Session management
app.post('/api/session/create', (req, res) => {
  const { budget = 10, model } = req.body;
  const id = uuidv4();
  sessions[id] = { id, budget: parseFloat(budget), spent: 0, model, history: [], createdAt: Date.now() };
  res.json({ sessionId: id, session: sessions[id] });
});

app.get('/api/session/:id', (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: 'Session not found' });
  res.json(s);
});

// Main analyze endpoint
app.post('/api/analyze', (req, res) => {
  const { query, sessionId, context } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const session = sessions[sessionId] || { budget: 10, spent: 0, model: null, history: [] };
  if (sessionId && !sessions[sessionId]) sessions[sessionId] = session;

  // Run multi-agent pipeline
  const result = runMultiAgent(query, session);

  // Update memory
  addToMemory(query, uuidv4());

  // Update session
  session.spent += result.cost;
  session.history.push({ query: query.slice(0, 100), model: result.routing.model, cost: result.cost, tokens: result.inputTokens + result.outputTokens, ts: Date.now() });

  // Update global metrics
  globalMetrics.totalQueries++;
  globalMetrics.totalTokensSaved += result.promptResult.tokensSaved + (result.kgResult?.originalTokens - result.kgResult?.compressedTokens || 0);
  globalMetrics.totalCostSaved += result.originalCost - result.cost;
  const mdKey = result.routing.model.includes('gpt-4') ? 'gpt4' : result.routing.model.includes('gpt-3') ? 'gpt35' : result.routing.model.includes('claude') ? 'claude' : 'gemini';
  globalMetrics.modelDistribution[mdKey]++;

  const hour = new Date().getHours();
  globalMetrics.hourlyUsage[hour]++;

  const today = new Date().toDateString();
  const dayEntry = globalMetrics.dailyCosts.find(d => d.date === today);
  if (dayEntry) dayEntry.cost += result.cost;
  else globalMetrics.dailyCosts.push({ date: today, cost: result.cost });

  const qEntry = {
    id: uuidv4(),
    query: query.slice(0, 80),
    model: result.routing.model,
    intent: result.intent.type,
    complexity: result.intent.complexity,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: result.cost,
    savedCost: result.originalCost - result.cost,
    tokensSaved: result.promptResult.tokensSaved,
    ts: Date.now(),
  };
  globalMetrics.queryLog.unshift(qEntry);
  if (globalMetrics.queryLog.length > 50) globalMetrics.queryLog.pop();

  const budgetPct = session.budget > 0 ? (session.spent / session.budget) * 100 : 0;

  res.json({
    success: true,
    queryId: qEntry.id,
    pipeline: result.agentLog,
    intent: result.intent,
    knowledgeGraph: result.kgResult,
    memories: result.memories.map(m => ({ text: m.text, score: m.score })),
    prompt: result.promptResult,
    routing: result.routing,
    tokens: { input: result.inputTokens, output: result.outputTokens, total: result.inputTokens + result.outputTokens },
    cost: { actual: result.cost, original: result.originalCost, saved: result.originalCost - result.cost },
    budget: { total: session.budget, spent: session.spent, remaining: session.budget - session.spent, usedPct: budgetPct },
    recommendation: budgetPct > 90 ? '🚨 Budget critically low! Switch to cheapest model immediately.' :
                    budgetPct > 70 ? '⚠️ Budget 70% used. Consider compressing prompts more aggressively.' :
                    '✅ Budget healthy. System optimizing for quality.',
  });
});

// Global metrics
app.get('/api/metrics', (req, res) => {
  const forecast = forecastCosts(globalMetrics.dailyCosts);
  const promptCount = Object.keys(globalMetrics.promptLibrary).length;
  res.json({
    ...globalMetrics,
    memorySize: memoryStore.length,
    promptLibrarySize: promptCount,
    forecast,
    avgCostPerQuery: globalMetrics.totalQueries > 0
      ? (globalMetrics.dailyCosts.reduce((s, d) => s + d.cost, 0) / globalMetrics.totalQueries)
      : 0,
  });
});

// Seed demo data
app.post('/api/demo/seed', (req, res) => {
  const demoQueries = [
    { q: 'What is machine learning?', complexity: 0.2 },
    { q: 'Analyze the architectural patterns of microservices and compare with monolithic systems', complexity: 0.9 },
    { q: 'Write a Python function to sort a list', complexity: 0.5 },
    { q: 'Summarize quantum computing research trends 2024', complexity: 0.75 },
    { q: 'What time is it?', complexity: 0.1 },
    { q: 'Evaluate the economic impact of generative AI on global software markets', complexity: 0.95 },
    { q: 'Translate hello to French', complexity: 0.15 },
    { q: 'Debug this React component and explain state management issues', complexity: 0.7 },
  ];

  const demoSession = { budget: 5, spent: 0, model: null, history: [] };
  demoQueries.forEach((dq, i) => {
    const routing = routeModel(dq.complexity, 5, demoSession.spent, null);
    const inputT = 50 + Math.floor(dq.complexity * 200);
    const outputT = 80 + Math.floor(dq.complexity * 300);
    const cost = computeCost(routing.model, inputT, outputT);
    demoSession.spent += cost;

    const day = new Date(Date.now() - (7 - i) * 86400000).toDateString();
    const existing = globalMetrics.dailyCosts.find(d => d.date === day);
    if (existing) existing.cost += cost * 3;
    else globalMetrics.dailyCosts.push({ date: day, cost: cost * 3 });

    globalMetrics.totalQueries++;
    globalMetrics.totalCostSaved += cost * 0.4;
    globalMetrics.totalTokensSaved += Math.floor(dq.complexity * 50 + 20);

    const mdKey = routing.model.includes('gpt-4') ? 'gpt4' : routing.model.includes('gpt-3') ? 'gpt35' : routing.model.includes('claude') ? 'claude' : 'gemini';
    globalMetrics.modelDistribution[mdKey]++;
    globalMetrics.hourlyUsage[(8 + i * 2) % 24] += 3 + i;

    globalMetrics.queryLog.unshift({ id: uuidv4(), query: dq.q, model: routing.model, intent: 'demo', complexity: dq.complexity, inputTokens: inputT, outputTokens: outputT, cost, savedCost: cost * 0.4, tokensSaved: 30, ts: Date.now() - (7 - i) * 86400000 });
    addToMemory(dq.q);
  });

  res.json({ success: true, message: 'Demo data seeded', queries: demoQueries.length });
});

// Budget endpoint
app.post('/api/session/:id/budget', (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: 'Session not found' });
  s.budget = parseFloat(req.body.budget) || s.budget;
  s.model = req.body.model || s.model;
  res.json(s);
});

// Prompt library
app.get('/api/prompts', (req, res) => {
  const lib = Object.entries(globalMetrics.promptLibrary).map(([k, v]) => ({ key: k, ...v }));
  res.json({ count: lib.length, prompts: lib.slice(0, 20) });
});

// Catch-all
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ALCIE Server running at http://localhost:${PORT}`));
