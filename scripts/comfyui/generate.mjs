#!/usr/bin/env node
// ComfyUI Z-Image-Turbo generation driver for before-she-wake.
// Requires a running ComfyUI instance (default http://127.0.0.1:8188).
//
// Usage:
//   node generate.mjs --workflow scene  --prompt "..." --out public/images --prefix bsw_scene [--seed 42] [--steps 8] [--w 1280 --h 832]
//   node generate.mjs --workflow card-text --card student-president --out public/images/cards
//   node generate.mjs --workflow card-ref   --card young-lady --ref ref/young-lady.jpg --out public/images/cards --denoise 0.6
//
// prompts.json maps --card names to { prompt, w, h, steps } and carries a "scene" entry.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188'
const POLL_MS = 2000
const POLL_TIMEOUT_MS = 10 * 60 * 1000

function args(entries) {
  const parsed = {}
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry.startsWith('--')) continue
    const key = entry.slice(2)
    const next = entries[index + 1]
    parsed[key] = next !== undefined && !next.startsWith('--') ? next : true
    if (parsed[key] !== true) index += 1
  }
  return parsed
}

function num(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function loadPrompts() {
  const file = join(__dirname, 'prompts.json')
  if (!existsSync(file)) return { cards: {}, scene: {} }
  return JSON.parse(readFileSync(file, 'utf8'))
}

function renderTemplate(name, values) {
  const file = join(__dirname, 'workflows', `${name}.json`)
  if (!existsSync(file)) throw new Error(`Workflow not found: ${file}`)
  let raw = readFileSync(file, 'utf8')
  for (const [key, value] of Object.entries(values)) {
    const token = `{{${key}}}`
    const serialized = JSON.stringify(value)
    raw = raw.split(token).join(serialized)
  }
  const missing = raw.match(/\{\{\w+\}\}/g)
  if (missing) throw new Error(`Unresolved placeholders in ${name}.json: ${missing.join(', ')}`)
  return JSON.parse(raw)
}

async function uploadImage(filePath, name) {
  const form = new FormData()
  form.append('image', new Blob([readFileSync(filePath)], { type: 'image/png' }), name)
  form.append('type', 'input')
  form.append('overwrite', 'true')
  const response = await fetch(`${BASE_URL}/upload/image`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`Upload failed (${response.status}): ${await response.text()}`)
  return name
}

async function submit(prompt) {
  const response = await fetch(`${BASE_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, client_id: 'before-she-wake' }),
  })
  const body = await response.json()
  if (!response.ok || !body.prompt_id) {
    throw new Error(`Prompt rejected: ${JSON.stringify(body.node_errors ?? body)}`)
  }
  return body.prompt_id
}

async function poll(promptId) {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const response = await fetch(`${BASE_URL}/history/${promptId}`)
    const history = await response.json()
    const record = history[promptId]
    if (record?.status?.status_str === 'success') return record.outputs
    if (record?.status?.status_str === 'error') throw new Error(`Generation error: ${JSON.stringify(record.status.messages)}`)
    await new Promise((resolveSleep) => setTimeout(resolveSleep, POLL_MS))
  }
  throw new Error(`Timed out waiting for prompt ${promptId}`)
}

async function download(viewParams, outFile) {
  const query = new URLSearchParams(viewParams).toString()
  const response = await fetch(`${BASE_URL}/view?${query}`)
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, bytes)
  return outFile
}

async function main() {
  const flags = args(process.argv.slice(2))
  const workflow = flags.workflow ?? 'card-text'
  const prompts = loadPrompts()
  const seed = Math.floor(num(flags.seed, Math.random() * 0xFFFFFFFF))

  let prompt = ''
  let w = num(flags.w, 1024)
  let h = num(flags.h, 1024)
  let steps = num(flags.steps, 8)
  let prefix = flags.prefix ?? 'bsw'

  if (flags.prompt) {
    prompt = flags.prompt
  } else if (flags.card) {
    const entry = prompts.cards[flags.card]
    if (!entry) throw new Error(`No prompt defined for card "${flags.card}" in prompts.json`)
    prompt = entry.prompt
    w = num(flags.w, entry.w ?? w)
    h = num(flags.h, entry.h ?? h)
    steps = num(flags.steps, entry.steps ?? steps)
    prefix = flags.prefix ?? `bsw_${flags.card}`
  } else if (workflow === 'scene') {
    const entry = prompts.scene
    prompt = entry.prompt
    w = num(flags.w, entry.w ?? w)
    h = num(flags.h, entry.h ?? h)
    steps = num(flags.steps, entry.steps ?? steps)
    prefix = flags.prefix ?? 'bsw_scene'
  } else {
    throw new Error('Provide --prompt or --card (or run scene workflow).')
  }

  let ref
  if (flags.ref) {
    const refPath = resolve(flags.ref)
    const refName = `bsw_ref_${Date.now()}.png`
    ref = await uploadImage(refPath, refName)
  }

  const values = { PROMPT: prompt, W: w, H: h, SEED: seed, STEPS: steps, PREFIX: prefix }
  if (ref) values.REF = ref
  if (flags.denoise !== undefined) values.DENOISE = num(flags.denoise, 0.6)
  const graph = renderTemplate(workflow, values)

  const promptId = await submit(graph)
  console.log(`[${workflow}] submitted ${promptId} seed=${seed} ${w}x${h} steps=${steps}`)
  const outputs = await poll(promptId)

  const outDir = flags.out ? resolve(flags.out) : join(__dirname, '..', '..', 'public', 'images')
  const files = []
  for (const node of Object.values(outputs)) {
    for (const image of node.images ?? []) {
      const extension = image.filename.includes('.') ? image.filename.slice(image.filename.lastIndexOf('.')) : '.png'
      const target = resolve(outDir, `${image.filename.replace(/\.[^.]+$/, '')}${extension}`)
      await download(image, target)
      files.push(target)
    }
  }
  console.log(`Saved: ${files.join(', ')}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
