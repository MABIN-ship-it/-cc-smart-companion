/**
 * Switch CC App model to deepseek-r1:8b, send message '1+1=?', measure TTFT & total time.
 * Connects to existing Electron browser via CDP at http://127.0.0.1:9223
 */
const { chromium } = require('playwright');
const { performance } = require('perf_hooks');

const CDP_URL = 'http://127.0.0.1:9223';
const MODEL_ID = 'ollama-deepseek-r1-8b';
const MODEL_NAME = 'deepseek-r1:8b';

async function main() {
  console.log(`[8b-test] Connecting to ${CDP_URL} ...`);
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[0];

  console.log(`[8b-test] Connected. Page title: "${await page.title()}"`);
  await page.screenshot({ path: 'test_screenshots/before_8b.png', fullPage: false });

  // Step 1: Configure model via localStorage
  const currentModel = await page.evaluate(() => localStorage.getItem('cc_current_model'));
  console.log(`[8b-test] Current model: ${currentModel}`);

  const cm = await page.evaluate(() => {
    const raw = localStorage.getItem('cc_custom_models') || '{}';
    return JSON.parse(raw);
  });
  cm[MODEL_ID] = {
    supplier: 'ollama',
    name: `ollama: ${MODEL_NAME}`,
    endpoint: 'http://localhost:11434/v1/chat/completions',
    protocol: 'openai',
    modelName: MODEL_NAME,
    defaultMaxTokens: 8192,
    contextWindow: 32768,
    description: `Local model ${MODEL_NAME}`,
  };

  await page.evaluate(({ cm, MODEL_ID }) => {
    localStorage.setItem('cc_custom_models', JSON.stringify(cm));
    localStorage.setItem('cc_current_model', MODEL_ID);
  }, { cm, MODEL_ID });

  console.log(`[8b-test] Set model to ${MODEL_ID} in localStorage`);

  // Step 2: Reload to apply model change
  console.log(`[8b-test] Reloading page with new model config...`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const appliedModel = await page.evaluate(() => localStorage.getItem('cc_current_model'));
  console.log(`[8b-test] Model after reload: ${appliedModel}`);

  await page.screenshot({ path: 'test_screenshots/after_reload.png', fullPage: false });

  // Step 3: Find and interact with chat input
  console.log(`[8b-test] Looking for chat input...`);

  let inputFilled = false;
  {
    const inputSelectors = [
      'textarea',
      'input[type="text"]',
      'input:not([type])',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[class*="InputBar"] input',
      '[class*="input-bar"] input',
      '[class*="chat"] input',
      '[class*="message"] input',
    ];
    for (const sel of inputSelectors) {
      const el = page.locator(sel).first();
      const count = await el.count();
      if (count > 0) {
        const visible = await el.isVisible().catch(() => false);
        if (visible) {
          await el.click();
          await el.fill('1+1=?');
          console.log(`[8b-test] Input found via '${sel}'`);
          inputFilled = true;
          break;
        }
      }
    }
  }

  if (!inputFilled) {
    const genericInput = page.locator('input, textarea, [contenteditable="true"]').first();
    if (await genericInput.count() > 0) {
      await genericInput.click();
      await genericInput.fill('1+1=?');
      inputFilled = true;
      console.log(`[8b-test] Input filled via generic fallback`);
    }
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test_screenshots/before_send.png', fullPage: false });

  // Step 4: Send message
  console.log(`[8b-test] Sending '1+1=?' via Enter key...`);
  const startTime = performance.now();
  await page.keyboard.press('Enter');

  // Step 5: Wait for response and measure
  console.log(`[8b-test] Waiting for response (Intel Arc 60s+ to load 8b, max 180s)...`);

  let ttft = -1;
  let totalTime = -1;
  let previousBodyLen = 0;
  let responseStarted = false;
  const maxWait = 180000;
  const pollInterval = 500;
  const iterations = Math.ceil(maxWait / pollInterval);

  for (let i = 0; i < iterations; i++) {
    await page.waitForTimeout(pollInterval);
    const elapsed = performance.now() - startTime;

    if (!responseStarted) {
      const newContent = await page.evaluate(() => {
        const msgs = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat-item"], [class*="ChatBubble"]');
        for (const msg of msgs) {
          const txt = msg.textContent || '';
          if (!txt.includes('1+1=?') && txt.length > 2) {
            return txt;
          }
        }
        return null;
      });

      if (newContent) {
        responseStarted = true;
        ttft = elapsed;
        previousBodyLen = newContent.length;
        console.log(`[8b-test] First response received! TTFT: ${ttft.toFixed(0)}ms (${(ttft/1000).toFixed(1)}s)`);
        console.log(`[8b-test] Response start: "${newContent.substring(0, 100)}..."`);
      } else if (i % 40 === 0) {
        console.log(`[8b-test] Waiting... ${(elapsed/1000).toFixed(0)}s elapsed`);
      }
    } else {
      const currentContent = await page.evaluate(() => {
        const msgs = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat-item"], [class*="ChatBubble"]');
        for (const msg of msgs) {
          const txt = msg.textContent || '';
          if (!txt.includes('1+1=?') && txt.length > 5) {
            return txt;
          }
        }
        return '';
      });

      if (currentContent && currentContent.length > 0) {
        if (currentContent.length !== previousBodyLen) {
          previousBodyLen = currentContent.length;
          if (i % 20 === 0) {
            console.log(`[8b-test] Streaming... ${currentContent.length} chars, ${(elapsed/1000).toFixed(1)}s`);
          }
        } else {
          await page.waitForTimeout(2000);
          const finalCheck = await page.evaluate(() => {
            const msgs = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat-item"], [class*="ChatBubble"]');
            for (const msg of msgs) {
              const txt = msg.textContent || '';
              if (!txt.includes('1+1=?') && txt.length > 5) {
                return txt;
              }
            }
            return '';
          });
          if (finalCheck && finalCheck.length > 0 && finalCheck.length === previousBodyLen) {
            totalTime = elapsed + 2000;
            console.log(`[8b-test] Response complete! Total: ${totalTime.toFixed(0)}ms (${(totalTime/1000).toFixed(1)}s)`);
            break;
          }
        }
      }
    }

    if (i === iterations - 1) {
      totalTime = elapsed;
      console.log(`[8b-test] Reached max wait (180s)`);
    }
  }

  if (totalTime < 0) totalTime = performance.now() - startTime;
  if (ttft < 0) ttft = totalTime;

  const finalText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: 'test_screenshots/after_8b_response.png', fullPage: false });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`8B MODEL TEST RESULTS`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Model:   deepseek-r1:8b`);
  console.log(`Prompt:  "1+1=?"`);
  console.log(`TTFT:    ${ttft.toFixed(0)}ms (${(ttft/1000).toFixed(1)}s)`);
  console.log(`Total:   ${totalTime.toFixed(0)}ms (${(totalTime/1000).toFixed(1)}s)`);
  console.log(`${'-'.repeat(50)}`);
  console.log(`Response text (first 1000 chars):`);
  console.log(finalText.substring(0, 1000));
  console.log(`${'-'.repeat(50)}`);
  console.log(`Screenshot saved to test_screenshots/after_8b_response.png`);

  await browser.close();
  console.log(`[8b-test] Done.`);
}

main().catch(err => {
  console.error(`[8b-test] ERROR:`, err);
  process.exit(1);
});
