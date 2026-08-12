import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mode = process.argv[2] ?? 'setup'
const width = Number(process.argv[3] ?? 1440)
const height = Number(process.argv[4] ?? 1000)
const output = process.argv[5] ?? join(tmpdir(), `before-she-wake-${mode}-${width}.png`)
const edge = process.env.BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const port = 9400 + Math.floor(Math.random() * 300)
const profile = join(tmpdir(), `before-she-wake-edge-${Date.now()}`)

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' })

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
      const page = targets.find((target) => target.type === 'page')
      if (page) return page
    } catch {
      // Edge is still starting.
    }
    await delay(100)
  }
  throw new Error('Timed out waiting for the browser target.')
}

function connect(url) {
  const socket = new WebSocket(url)
  const pending = new Map()
  let messageId = 0

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }

  return {
    ready: new Promise((resolve, reject) => {
      socket.onopen = resolve
      socket.onerror = reject
    }),
    send(method, params = {}) {
      const id = ++messageId
      socket.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
    close: () => socket.close(),
  }
}

try {
  const target = await waitForTarget()
  const client = connect(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  })
  await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await delay(900)

  if (mode === 'online' || mode === 'lobby') {
    await client.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.mode-choice')[0]?.click()`,
    })
    await delay(300)
    if (mode === 'lobby') {
      await client.send('Runtime.evaluate', {
        expression: `(() => {
          const input = document.querySelector('input[autocomplete="nickname"]');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, '浏览器测试');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`,
      })
      await delay(150)
      await client.send('Runtime.evaluate', {
        expression: `document.querySelector('.online-create-button')?.click()`,
      })
      await delay(650)
    }
  }

  if (mode.startsWith('game')) {
    await client.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.mode-choice')[1]?.click()`,
    })
    await delay(300)
    await client.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.kind-toggle button:first-child').forEach((button) => button.click())`,
    })
    await delay(250)
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('.start-button')?.click()`,
    })
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const gate = await client.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `Boolean(document.querySelector('.privacy-gate .primary-button'))`,
      })
      if (gate.result.value) {
        await client.send('Runtime.evaluate', {
          expression: `document.querySelector('.privacy-gate .primary-button')?.click()`,
        })
        break
      }
      await delay(250)
    }
    await delay(250)
    if (mode === 'game-action') {
      await client.send('Runtime.evaluate', {
        expression: `document.querySelectorAll('.mobile-game-nav button')[2]?.click()`,
      })
      await delay(150)
    }
  }

  const metrics = await client.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { element: element.tagName + '.' + element.className, left: rect.left, right: rect.right };
        })
        .filter((item) => item.left < -1 || item.right > viewportWidth + 1)
        .slice(0, 12);
      return {
        innerWidth: window.innerWidth,
        clientWidth: viewportWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        offenders,
      };
    })()`,
  })
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  await writeFile(output, Buffer.from(screenshot.data, 'base64'))
  client.close()
  process.stdout.write(`${JSON.stringify(metrics.result.value)}\n${output}\n`)
} finally {
  browser.kill()
}
