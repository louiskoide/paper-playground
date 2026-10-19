// Model transport. Default: `claude -p` with no tools, settings, MCP or session, so evals run on the
// local Claude login without an API key and behave like a single API call. Set PP_TRANSPORT=api (and
// ANTHROPIC_API_KEY) to call the Messages API instead; the deployed app always uses the API.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MODELS = {
  extract: process.env.PP_EXTRACT_MODEL || 'claude-opus-5-5',
  generate: process.env.PP_GENERATE_MODEL || 'claude-opus-5-5',
};

export async function complete({ system, user, model, maxTokens = 32000, timeoutMs = 20 * 60e3 }) {
  return process.env.PP_TRANSPORT === 'api' ? viaApi({ system, user, model, maxTokens }) : viaCli({ system, user, model, timeoutMs });
}

function viaCli({ system, user, model, timeoutMs }) {
  const dir = mkdtempSync(join(tmpdir(), 'pp-llm-')), sys = join(dir, 'system.md');
  writeFileSync(sys, system);
  const args = ['-p', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence',
    '--model', model, '--system-prompt-file', sys, '--output-format', 'json'];
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const p = spawn('claude', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMs);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => {
      clearTimeout(timer); rmSync(dir, { recursive: true, force: true });
      try {
        const j = JSON.parse(out);
        if (j.is_error) throw new Error(j.result || 'error');
        resolve({ text: j.result, cost: j.total_cost_usd ?? null, ms: Date.now() - t0, usage: j.usage, model });
      } catch (e) { reject(new Error(`claude -p exited ${code}: ${e.message}\n${err.slice(-400)}${out.slice(-400)}`)); }
    });
    p.stdin.end(user);
  });
}

async function viaApi({ system, user, model, maxTokens }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic(), t0 = Date.now();
  const stream = client.messages.stream({
    model, max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  return { text: msg.content.filter(b => b.type === 'text').map(b => b.text).join(''), cost: null, ms: Date.now() - t0, usage: msg.usage, model };
}
