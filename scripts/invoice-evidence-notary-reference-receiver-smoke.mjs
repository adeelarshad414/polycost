import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiverScript = path.join(root, 'scripts', 'invoice-evidence-notary-reference-receiver.mjs');
const senderScript = path.join(root, 'scripts', 'invoice-evidence-notary-webhook-smoke.mjs');
const secret = 'local-invoice-evidence-notary-reference-secret-32chars';
const artifactDir = path.join(
  root,
  'artifacts',
  'invoice-evidence-notary-reference-receiver',
  `smoke-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);

await mkdir(artifactDir, { recursive: true });

const receiver = spawn(
  process.execPath,
  [receiverScript, '--dev', '--port=0', `--artifact-dir=${artifactDir}`],
  {
    cwd: root,
    env: {
      ...process.env,
      INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET: secret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

const receiverExit = new Promise((resolve) => {
  receiver.once('exit', (code, signal) => {
    resolve({ code, signal });
  });
});

try {
  const ready = await waitForReceiver(receiver);
  const health = await fetchJson(ready.healthReadyUrl, 'reference receiver readiness');

  if (health.status !== 'ready' || health.immutableRetentionProved !== false) {
    fail(`Unexpected readiness payload: ${JSON.stringify(health)}`);
  }

  const sender = spawnSync(
    process.execPath,
    [senderScript, `--url=${ready.receiverUrl}`, `--secret=${secret}`, '--allow-http-local'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        INVOICE_EVIDENCE_RECEIPT_SIGNING_SECRET: secret,
      },
      maxBuffer: 1024 * 1024,
    },
  );

  if (sender.status !== 0) {
    fail(
      `Reference receiver smoke sender failed with status ${sender.status}:\n${sender.stdout}\n${sender.stderr}`,
    );
  }

  const senderSummary = parseJsonObjectFromOutput(sender.stdout);

  if (senderSummary.status !== 'pass' || !senderSummary.packetDigestSha256) {
    fail(`Unexpected sender summary: ${sender.stdout}`);
  }

  const artifact = await waitForArtifact(artifactDir);
  const lines = (await readFile(artifact, 'utf8')).trim().split('\n');

  if (lines.length !== 1) {
    fail(`Expected one JSONL receipt in ${artifact}; got ${lines.length}.`);
  }

  const receipt = JSON.parse(lines[0]);

  if (receipt.schemaVersion !== 'invoice-evidence-notary-reference-receiver/v1') {
    fail(`Unexpected receipt schema in ${artifact}: ${receipt.schemaVersion}`);
  }

  if (receipt.headers.packetDigestSha256 !== senderSummary.packetDigestSha256) {
    fail('Captured receipt packet digest does not match sender summary.');
  }

  if (receipt.retention.immutableRetentionProved !== false) {
    fail('Reference receiver smoke must not claim immutable retention proof.');
  }

  await stopReceiver(receiver, receiverExit);

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        receiverUrl: ready.receiverUrl,
        healthReadyUrl: ready.healthReadyUrl,
        artifact,
        packetDigestSha256: senderSummary.packetDigestSha256,
        basePayloadDigestSha256: senderSummary.basePayloadDigestSha256,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await stopReceiver(receiver, receiverExit);
  fail(error instanceof Error ? error.message : 'invoice_evidence_notary_reference_smoke_error');
}

function waitForReceiver(childProcess) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for reference receiver startup.\n${stdout}\n${stderr}`));
    }, 15_000);

    childProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');

      for (const line of stdout.split('\n')) {
        const parsed = tryParseJson(line);

        if (parsed?.status === 'listening' && parsed.receiverUrl && parsed.healthReadyUrl) {
          clearTimeout(timeout);
          resolve(parsed);
          return;
        }
      }
    });

    childProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    childProcess.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Reference receiver exited before startup: ${code ?? signal}\n${stderr}`));
    });
  });
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${body}`);
  }

  return JSON.parse(body);
}

async function waitForArtifact(directory) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const entries = await readdir(directory);
    const jsonl = entries.find((entry) => entry.endsWith('.jsonl'));

    if (jsonl) {
      return path.join(directory, jsonl);
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for receiver artifact in ${directory}.`);
}

async function stopReceiver(childProcess, exitPromise) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return exitPromise;
  }

  childProcess.kill('SIGTERM');

  const result = await Promise.race([
    exitPromise,
    delay(5_000).then(() => {
      childProcess.kill('SIGKILL');
      return exitPromise;
    }),
  ]);

  return result;
}

function parseJsonObjectFromOutput(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    fail(`No JSON summary found in output:\n${output}`);
  }

  return JSON.parse(output.slice(start, end + 1));
}

function tryParseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
