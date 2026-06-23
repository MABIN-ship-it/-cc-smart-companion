/**
 * Switch to deepseek-r1:8b, send '1+1=?', properly measure TTFT and total time.
 * Connects to existing browser via CDP at http://127.0.0.1:9223
 */
const { chromium } = require('playwright');
const { performance } = require('perf_hooks');

const CDP_URL = 'http://127.0.0.1:9223';
const MODEL_ID = 'ollama-deepseek-r1-8b';
const MODEL_NAME = 'deepseek-r1:8b';

async function main() {
  console.log(`[test] Connecting to ${CDP_URL} ...`);
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log(`[test] Connected. Title: "${await page.title()}"`);

  // Step 1: Set model to 8b in localStorage and reload
  await page.evaluate(({ MODEL_ID, MODEL_NAME }) => {
    const cm = JSON.parse(localStorage.getItem('cc_custom_models') || '{}');
    cm[MODEL_ID] = {
      supplier: 'ollama',
      name: 'ollama: ' + MODEL_NAME,
      endpoint: 'http://localhost:11434/v1/chat/completions',
      protocol: 'openai',
      modelName: MODEL_NAME,
      defaultMaxTokens: 8192,
      contextWindow: 32768,
      description: 'Local model ' + MODEL_NAME,
    };
    localStorage.setItem('cc_custom_models', JSON.stringify(cm));
    localStorage.setItem('cc_current_model', MODEL_ID);
  }, { MODEL_ID, MODEL_NAME });

  const currentModel = await page.evaluate(() => localStorage.getItem('cc_current_model'));
  console.log(`[test] Model set to: ${currentModel}`);

  // Reload
  console.log(`[test] Reloading page...`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Step 2: Find the input field and send '1+1=?'
  console.log(`[test] Looking for chat input...`);
  let inputFilled = false;

  const selectors = [
    'textarea', 'input[type="text"]', 'input:not([type])',
    '[contenteditable="true"]', '[role="textbox"]',
    '[class*="InputBar"] input', '[class*="input-bar"] input',
  ];

  for (const sel of selectors) {
    const el = page.locator(sel).first();
    const count = await el.count();
    if (count > 0) {
      const visible = await el.isVisible().catch(() => false);
      if (visible) {
        await el.click();
        await el.fill('1+1=?');
        console.log(`[test] Input found via '${sel}'`);
        inputFilled = true;
        break;
      }
    }
  }

  if (!inputFilled) {
    // Fallback: try any input/textarea
    const fallback = page.locator('input, textarea, [contenteditable="true"]').first();
    const count = await fallback.count();
    if (count > 0) {
      await fallback.click();
      await fallback.fill('1+1=?');
      inputFilled = true;
      console.log(`[test] Input filled via generic fallback`);
    }
  }

  if (!inputFilled) {
    console.error(`[test] Could not find chat input`);
    await page.screenshot({ path: 'test_screenshots/no_input.png' });
    await browser.close();
    return;
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test_screenshots/before_send.png' });

  // Step 3: Get baseline text before sending
  const baselineText = await page.evaluate(() => document.body.innerText);
  const baselineLen = baselineText.length;
  console.log(`[test] Baseline body length: ${baselineLen}`);

  // Step 4: Send message
  console.log(`[test] Sending '1+1=?' via Enter key...`);
  const startTime = performance.now();
  await page.keyboard.press('Enter');

  // Step 5: Wait for response and measure
  console.log(`[test] Waiting for response (Intel Arc 60s+ to load 8b, max 180s)...`);

  let ttft = -1;
  let totalTime = -1;
  let prevLen = baselineLen;
  let responseStarted = false;
  let stableCount = 0;
  const maxWait = 180000;
  const pollInterval = 500;
  const maxIterations = Math.ceil(maxWait / pollInterval);

  for (let i = 0; i < maxIterations; i++) {
    await page.waitForTimeout(pollInterval);
    const elapsed = performance.now() - startTime;

    // Get current body text length
    const currentLen = await page.evaluate(() => document.body.innerText.length);
    const hasChanged = currentLen !== prevLen;

    if (!responseStarted) {
      if (hasChanged) {
        responseStarted = true;
        ttft = elapsed;
        console.log(`[test] RESPONSE STARTED! TTFT: ${ttft.toFixed(0)}ms (${(ttft/1000).toFixed(1)}s)`);
        console.log(`[test] Body length change: ${prevLen} -> ${currentLen}`);
        prevLen = currentLen;
      } else if (i % 40 === 0 && i > 0) {
        console.log(`[test] Waiting for response... ${(elapsed/1000).toFixed(0)}s elapsed`);
      }
    } else {
      // Response in progress - check if still growing or stable
      if (hasChanged) {
        stableCount = 0;
        prevLen = currentLen;
        if (i % 20 === 0) {
          console.log(`[test] Streaming... ${currentLen} chars, ${(elapsed/1000).toFixed(1)}s`);
        }
      } else {
        stableCount++;
        // Consider stable after 3 seconds with no change
        if (stableCount >= 6) {
          totalTime = elapsed;
          console.log(`[test] RESPONSE COMPLETE! Total: ${totalTime.toFixed(0)}ms (${(totalTime/1000).toFixed(1)}s)`);
          break;
        }
      }
    }

    if (i === maxIterations - 1) {
      totalTime = elapsed;
      console.log(`[test] Reached max wait (180s)`);
    }
  }

  if (totalTime < 0) totalTime = performance.now() - startTime;
  if (ttft < 0) ttft = totalTime;

  // Step 6: Get final response text
  const finalText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: 'test_screenshots/after_8b_response.png' });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 8B MODEL TEST RESULTS`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Model:   deepseek-r1:8b`);
  console.log(`Prompt:  "1+1=?"`);
  console.log(`TTFT:    ${ttft.toFixed(0)}ms (${(ttft/1000).toFixed(1)}s)`);
  console.log(`Total:   ${totalTime.toFixed(0)}ms (${(totalTime/1000).toFixed(1)}s)`);
  console.log(`Body:    ${finalText.length} chars total`);
  console.log(`${'-'.repeat(50)}`);
  console.log(`New response (trimmed, first 500 chars):`);
  console.log(finalText.substring(baselineLen, baselineLen + 500));
  console.log(`${'-'.repeat(50)}`);
  console.log(`All screenshots saved to test_screenshots/`);

  await browser.close();
  console.log(`[test] Done.`);
}

main().catch(err => {
  console.error(`[test] ERROR:`, err);
  process.exit(1);
});
