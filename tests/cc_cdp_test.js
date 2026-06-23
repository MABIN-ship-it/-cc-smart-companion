const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const SCREENSHOT_DIR = path.join(__dirname, "..", "test_screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function ts() { return new Date().toISOString().substring(11, 19); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  log("Connecting to CC via CDP...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  
  log(`Page: ${await page.title()}`);

  // === Step 1: Skip onboarding ===
  await page.evaluate(() => localStorage.setItem("cc_onboarding_done", "1"));
  log("Set onboarding_done=1");

  // === Step 2: Check current mode ===
  const sceneStatus = await page.evaluate(() => {
    const dot = document.querySelector(".scene-status-dot");
    return dot ? dot.className : "none";
  });
  log(`Scene status: ${sceneStatus}`);

  // Check for input field 
  const inputField = page.locator(".input-field");
  const inputCount = await inputField.count();
  log(`Input fields: ${inputCount}`);

  // Check for input-mode-tab elements (chat vs voice)
  const modeTabs = page.locator(".input-mode-tab");
  const tabCount = await modeTabs.count();
  log(`Mode tabs: ${tabCount}`);
  
  if (tabCount > 0) {
    const tabTexts = await modeTabs.allTextContents();
    log(`Tab labels: ${tabTexts.join(" | ")}`);
    
    // Click first tab (likely chat mode)
    if (!(await modeTabs.first().evaluate(el => el.classList.contains("active")))) {
      log("Clicking chat mode tab...");
      await modeTabs.first().click();
      await sleep(1000);
    }
  }

  // === Step 3: Try to find and click the input field ===
  if (inputCount > 0) {
    log("Clicking input field...");
    await inputField.first().click();
    await sleep(500);
  }

  // Check for contenteditable inside input-field
  const ceInInput = page.locator(".input-field [contenteditable]");
  const ceInInputCount = await ceInInput.count();
  log(`Contenteditable inside input-field: ${ceInInputCount}`);

  // Try all contenteditable
  const allCE = page.locator('[contenteditable="true"]');
  const allCECount = await allCE.count();
  log(`All contenteditable: ${allCECount}`);

  // Try typing via keyboard directly into focused element
  const testMessage = "你好，简单介绍你自己，一句话";
  
  if (ceInInputCount > 0) {
    log("Using input-field contenteditable...");
    await ceInInput.first().click();
    await sleep(300);
    await ceInInput.first().fill(""); // clear
    await ceInInput.first().type(testMessage, { delay: 20 });
  } else if (allCECount > 0) {
    log("Using generic contenteditable...");
    await allCE.first().click();
    await sleep(300);
    await allCE.first().fill("");
    await allCE.first().type(testMessage, { delay: 20 });
  } else {
    // Try input-field directly (might be input/textarea)
    if (inputCount > 0) {
      log("Typing into input-field directly...");
      await inputField.first().click();
      await sleep(300);
      await page.keyboard.type(testMessage, { delay: 20 });
    } else {
      log("ERROR: No input element found. Taking screenshot...");
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "cc_no_input.png"), fullPage: true });
      await browser.close();
      return;
    }
  }

  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "cc_message_typed.png") });
  log("Message typed, screenshot saved.");

  // === Step 4: Send message ===
  const sendBtn = page.locator(".input-send-btn");
  if (await sendBtn.count() > 0) {
    log("Clicking send button...");
    await sendBtn.first().click();
  } else {
    log("No send button, pressing Enter...");
    await page.keyboard.press("Enter");
  }

  log("Message sent! Monitoring response...");
  
  const startTime = Date.now();
  let maxText = "";
  let textDisappeared = false;
  let previousLength = 0;
  let stagnantCount = 0;

  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    try {
      // Get AI response text - look in chat-bubble elements (not user-bubble)
      const aiText = await page.evaluate(() => {
        const bubbles = document.querySelectorAll(".chat-bubble");
        const texts = [];
        for (const b of bubbles) {
          // Skip user bubbles
          if (b.classList.contains("user-bubble")) continue;
          const text = b.innerText.trim();
          if (text.length > 0) texts.push(text);
        }
        return texts.join("\n---\n");
      });

      if (aiText.length > maxText.length) {
        maxText = aiText;
        const delta = aiText.length - previousLength;
        log(`[${elapsed}s] Text growing: +${delta} = ${aiText.length} total → "${aiText.substring(Math.max(0, aiText.length - 80))}"`);
        previousLength = aiText.length;
        stagnantCount = 0;
      } else if (maxText.length > 0 && aiText.length === previousLength) {
        stagnantCount++;
      }

      // Detect text disappearance
      if (maxText.length > 50 && aiText.length < maxText.length * 0.3 && aiText.length < 10) {
        log(`[${elapsed}s] ⚠️ TEXT DISAPPEARED! From ${maxText.length} to ${aiText.length}`);
        textDisappeared = true;
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "cc_text_disappeared.png") });
        break;
      }

      // Check if done (no stop button)
      const stopBtn = page.locator("button:has-text('停止'), .stop-btn, [class*='stop']");
      const stopCount = await stopBtn.count();
      
      if (stopCount === 0 && stagnantCount >= 8 && maxText.length > 20) {
        log(`[${elapsed}s] ✅ Response complete (stopped growing for ${stagnantCount}s)`);
        break;
      }
    } catch (e) {
      log(`[${elapsed}s] Error: ${e.message.substring(0, 80)}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  log("\n========== TEST RESULTS ==========");
  log(`Response time: ${totalTime}s`);
  log(`Max text length: ${maxText.length} chars`);
  log(`Text disappeared: ${textDisappeared}`);
  log(`Response:\n${maxText.substring(0, 500)}`);
  log("==================================");

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "cc_test_result.png"), fullPage: true });
  log("Final screenshot saved. CC remains open.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
