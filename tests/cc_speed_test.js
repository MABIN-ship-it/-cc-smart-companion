const { chromium } = require("playwright");

(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const p = b.contexts()[0].pages()[0];
  console.log("Connected:", await p.title());

  const model = await p.evaluate(() => localStorage.getItem("cc_current_model"));
  console.log("Model:", model);

  // Find input and send
  const input = p.locator(".input-field").first();
  await input.click({ force: true });
  await input.fill("");
  await input.type("1+1=? 一句话", { delay: 10 });
  console.log("Typed");

  const t0 = Date.now();
  await p.locator(".input-send-btn").first().click({ force: true });
  console.log("Sent");

  let firstToken = null, maxLen = 0, lastLen = 0, stagnant = 0;
  for (let i = 0; i < 600; i++) {
    await new Promise(r => setTimeout(r, 200));
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const text = await p.evaluate(() => {
      const all = document.querySelectorAll(".chat-bubble:not(.user-bubble)");
      if (!all.length) return "";
      const last = all[all.length - 1];
      return (last.querySelector(".chat-bubble-text") || last).innerText.trim();
    });

    if (text.length > 0 && !firstToken) {
      firstToken = elapsed;
      console.log(`FIRST TOKEN: ${firstToken}s`);
    }

    if (text.length > maxLen) {
      maxLen = text.length;
      if (text.length - lastLen > 2 || i % 10 === 0) {
        console.log(`[${elapsed}s] ${text.length}c — "${text.slice(-60)}"`);
      }
      lastLen = text.length;
      stagnant = 0;
    } else if (maxLen > 0) {
      stagnant++;
    }

    if (stagnant >= 50 && maxLen > 5) {
      console.log(`DONE at ${elapsed}s`);
      break;
    }
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nTTFT: ${firstToken || "N/A"}s | Total: ${total}s | Max: ${maxLen}c`);
  await b.close();
})();
