#!/usr/bin/env node
// Generate website preview screenshots for publication URLs.
// Reads _publications/*.md, extracts external_url and doi fields,
// screenshots each URL with Puppeteer, saves as:
//   assets/previews/{SHA256}.webp       (thumbnail, 640px wide)
//   assets/previews/{SHA256}-full.webp  (full viewport capture)
// Skips URLs where the thumbnail already exists.
// Requires: puppeteer, system chromium, cwebp

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PUBLICATIONS_DIR = path.join(__dirname, '..', '_publications');
const PREVIEWS_DIR = path.join(__dirname, '..', 'assets', 'previews');
const DATA_FILE = path.join(__dirname, '..', '_data', 'previews.yml');

const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 2 };
const THUMB_WIDTH = 640;
const WEBP_QUALITY = 80;
const TIMEOUT = 30000;

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function extractFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

function collectUrls() {
  const urlMap = new Map(); // url -> { wait: seconds }
  const files = fs.readdirSync(PUBLICATIONS_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(PUBLICATIONS_DIR, file), 'utf8');
    const fm = extractFrontMatter(content);
    const wait = parseInt(fm.screenshot_wait) || 0;
    const screenshotUrl = fm.screenshot_url || null;
    if (fm.external_url) urlMap.set(fm.external_url, { wait, screenshotUrl });
    if (fm.doi) urlMap.set(`https://doi.org/${fm.doi}`, { wait });
  }
  return urlMap;
}

function loadExistingPreviews() {
  if (!fs.existsSync(DATA_FILE)) return {};
  const content = fs.readFileSync(DATA_FILE, 'utf8');
  const map = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^"(.+)":\s*"(.+)"$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

function savePreviews(map) {
  const lines = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, file]) => `"${url}": "${file}"`);
  fs.writeFileSync(DATA_FILE, lines.join('\n') + '\n');
}

function pngToWebp(pngPath, webpPath, resizeWidth) {
  const resize = resizeWidth ? `-resize ${resizeWidth} 0` : '';
  execSync(`cwebp -q ${WEBP_QUALITY} ${resize} "${pngPath}" -o "${webpPath}"`, {
    stdio: 'pipe'
  });
}

function imgToWebp(inputPath, webpPath, resizeWidth) {
  // Convert any image format to webp via cwebp (supports jpg, png, tiff)
  const resize = resizeWidth ? `-resize ${resizeWidth} 0` : '';
  try {
    execSync(`cwebp -q ${WEBP_QUALITY} ${resize} "${inputPath}" -o "${webpPath}"`, { stdio: 'pipe' });
    return true;
  } catch (_) {
    return false;
  }
}

async function downloadFile(url, dest) {
  execSync(`curl -sL -o "${dest}" "${url}"`, { timeout: 15000 });
  return fs.existsSync(dest) && fs.statSync(dest).size > 0;
}

async function main() {
  const urlMap = collectUrls();
  console.log(`Found ${urlMap.size} URLs to preview`);

  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });

  const previews = loadExistingPreviews();
  const toCapture = [];

  for (const [url, opts] of urlMap) {
    const hash = sha256(url);
    const thumbFile = `${hash}.webp`;
    const thumbPath = path.join(PREVIEWS_DIR, thumbFile);

    if (fs.existsSync(thumbPath)) {
      console.log(`  skip (exists): ${url}`);
      previews[url] = thumbFile;
      continue;
    }

    toCapture.push({ url, hash, thumbFile, thumbPath, extraWait: opts.wait, screenshotUrl: opts.screenshotUrl });
  }

  if (toCapture.length === 0) {
    console.log('All previews up to date');
    savePreviews(previews);
    return;
  }

  console.log(`Capturing ${toCapture.length} new previews...`);

  const errors = [];
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());

  const browser = await puppeteer.launch({
    headless: 'new', // "new" headless mode — harder to detect than legacy
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1280,800',
    ]
  });

  // Try to dismiss cookie/privacy banners. Prefer "Reject" over "Accept".
  async function dismissCookieBanners(page) {
    // Special handling for OneTrust (Taylor & Francis, etc.)
    // Use real mouse click at button coordinates — defeats anti-automation
    try {
      const otBtn = await page.$('#onetrust-reject-all-handler')
        || await page.$('.ot-pc-refuse-all-handler');
      if (otBtn) {
        const box = await otBtn.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await new Promise(r => setTimeout(r, 2000));
          return true;
        }
      }
      // Open preference center then reject
      const otPcBtn = await page.$('#onetrust-pc-btn-handler');
      if (otPcBtn) {
        const pcBox = await otPcBtn.boundingBox();
        if (pcBox) {
          await page.mouse.click(pcBox.x + pcBox.width / 2, pcBox.y + pcBox.height / 2);
          await new Promise(r => setTimeout(r, 2000));
          const rejectBtn = await page.$('.ot-pc-refuse-all-handler');
          if (rejectBtn) {
            const rBox = await rejectBtn.boundingBox();
            if (rBox) {
              await page.mouse.click(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
              await new Promise(r => setTimeout(r, 2000));
              return true;
            }
          }
        }
      }
    } catch (_) {}

    // Priority 1: Reject All / Deny / Decline buttons
    const REJECT_SELECTORS = [
      'button[id*="reject" i]', 'button[class*="reject" i]',
      'button[aria-label*="reject" i]', 'button[aria-label*="deny" i]',
      'button[aria-label*="decline" i]',
      '.fc-cta-do-not-consent',
      '[data-cookiefirst-action="reject"]',
      '#didomi-notice-disagree-button',
      'button[title*="reject" i]', 'button[title*="deny" i]',
      'button[title*="Reject" i]',
      '.privacy-cp-reject', '[class*="reject-all" i]',
    ];

    // Priority 2: Accept All / Agree / OK buttons
    const ACCEPT_SELECTORS = [
      '#onetrust-accept-btn-handler',
      '.fc-cta-consent',
      '#didomi-notice-agree-button',
      'button[id*="accept" i]', 'button[class*="accept" i]',
      'button[aria-label*="accept" i]', 'button[aria-label*="agree" i]',
      '[data-cookiefirst-action="accept"]',
      '.cc-accept', '.cc-allow', '.cc-btn-accept',
      '.CookieConsent button', '.cookie-accept',
      '.gdpr-accept', '#gdpr-accept',
    ];

    // Priority 3: Generic dismiss / close on overlays
    const DISMISS_SELECTORS = [
      '[class*="cookie" i] button', '[class*="consent" i] button',
      '[class*="privacy" i] button',
      '[class*="CookieBanner"] button',
      '[class*="banner" i] [class*="close" i]',
      '[id*="cookie" i] button',
    ];

    for (const group of [REJECT_SELECTORS, ACCEPT_SELECTORS, DISMISS_SELECTORS]) {
      for (const selector of group) {
        try {
          const btns = await page.$$(selector);
          for (const btn of btns) {
            const visible = await btn.boundingBox();
            if (visible) {
              await btn.click();
              await new Promise(r => setTimeout(r, 800));
              return true;
            }
          }
        } catch (_) {}
      }
    }

    // Last resort: find any visible button by text content across languages.
    // Reject keywords first (preferred), then accept as fallback.
    try {
      const dismissed = await page.evaluate(() => {
        const rejectKeywords = [
          // English
          'reject all', 'deny all', 'decline all', 'refuse all', 'reject cookies',
          // Dutch
          'alles weigeren', 'alles afwijzen', 'weiger alles', 'cookies weigeren',
          // German
          'alle ablehnen', 'alles ablehnen', 'cookies ablehnen', 'nur notwendige',
          // Italian
          'rifiuta tutto', 'rifiuta tutti', 'nega tutto', 'rifiuta i cookie',
          // French
          'tout refuser', 'refuser tout', 'tout rejeter',
        ];
        const acceptKeywords = [
          // English
          'accept all', 'accept cookies', 'agree', 'i agree', 'got it', 'i understand', 'ok', 'allow all',
          // Dutch
          'alles accepteren', 'alles toestaan', 'akkoord', 'cookies accepteren', 'ik ga akkoord', 'accepteer', 'accepteren',
          // German
          'alle akzeptieren', 'alles akzeptieren', 'alle zulassen', 'einverstanden', 'cookies akzeptieren',
          // Italian
          'accetta tutto', 'accetta tutti', 'accetta i cookie', 'acconsento',
          // French
          'tout accepter', 'accepter tout', "j'accepte", 'accepter les cookies',
        ];
        const buttons = [...document.querySelectorAll('button, a[role="button"], [class*="btn"], [role="button"]')];
        for (const keywords of [rejectKeywords, acceptKeywords]) {
          for (const kw of keywords) {
            const btn = buttons.find(b => {
              const text = b.textContent.trim().toLowerCase();
              return text === kw || text.includes(kw);
            });
            if (btn && btn.offsetParent !== null) { btn.click(); return true; }
          }
        }
        return false;
      });
      if (dismissed) await new Promise(r => setTimeout(r, 800));
      return dismissed;
    } catch (_) {}

    return false;
  }

  const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Consent/tracking domains to block — prevents banners from loading at all
  const BLOCKED_DOMAINS = [
    'onetrust.com', 'cookielaw.org', 'cookiepro.com',
    'cookiebot.com', 'cookiefirst.com',
    'didomi.io', 'privacy-center.org',
    'quantcast.com', 'consensu.org',
    'trustarc.com', 'evidon.com',
  ];

  for (const { url, hash, thumbFile, thumbPath, extraWait, screenshotUrl } of toCapture) {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // Block consent SDK scripts — but NOT for sites that require consent to show content
    const consentRequiredDomains = ['tandfonline.com', 'taylor', 'doi.org'];
    const skipBlocking = consentRequiredDomains.some(d => url.toLowerCase().includes(d));

    // For consent-gated sites: navigate first, set consent cookie on resolved domain, then reload
    if (skipBlocking) {
      page._needsConsentReload = true;
    }

    await page.setRequestInterception(true);
    page.on('request', req => {
      const reqUrl = req.url().toLowerCase();
      if (!skipBlocking && BLOCKED_DOMAINS.some(d => reqUrl.includes(d))) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Inject CSS + MutationObserver to hide consent UI (skip for sites needing consent to show content)
    if (!skipBlocking) await page.evaluateOnNewDocument(() => {
      const HIDE_SELECTORS = [
        '#onetrust-consent-sdk', '#onetrust-banner-sdk', '#onetrust-pc-sdk',
        '.onetrust-pc-dark-filter', '#ot-sdk-btn-floating',
        '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',
        '.fc-consent-root', '.fc-dialog-overlay',
        '#didomi-host', '#didomi-popup',
        '[id*="sp_message_container"]',
      ].join(', ');

      // CSS fallback
      const style = document.createElement('style');
      style.textContent = `
        ${HIDE_SELECTORS},
        div[class*="cookie" i][class*="banner" i],
        div[class*="cookie" i][class*="consent" i],
        div[class*="privacy" i][class*="notice" i]
        { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
        body, html { overflow: auto !important; }
      `;
      document.documentElement.appendChild(style);

      // MutationObserver: remove known consent SDK containers as they appear
      const observer = new MutationObserver(() => {
        document.querySelectorAll(HIDE_SELECTORS).forEach(el => el.remove());
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });

    const pngPath = path.join(PREVIEWS_DIR, `${hash}.png`);
    const fullWebpPath = path.join(PREVIEWS_DIR, `${hash}-full.webp`);

    try {
      const isPdf = url.toLowerCase().endsWith('.pdf');
      const isArchiveOrg = url.includes('web.archive.org');
      const pageTimeout = isArchiveOrg ? 60000 : TIMEOUT;
      const loadWait = isArchiveOrg ? 45000 : 15000;

      // Handle PDFs: download and convert first page directly
      if (isPdf) {
        console.log(`  capture (PDF): ${url}`);
        const pdfPath = path.join(PREVIEWS_DIR, `${hash}.pdf`);
        const ppmPrefix = path.join(PREVIEWS_DIR, `${hash}-ppm`);
        try {
          execSync(`curl -sL -o "${pdfPath}" "${url}"`, { timeout: 30000 });
          // Convert first page to PNG at 2x resolution (288 DPI)
          execSync(`pdftoppm -png -r 288 -f 1 -l 1 "${pdfPath}" "${ppmPrefix}"`);
          const ppmFile = fs.readdirSync(PREVIEWS_DIR).find(f => f.startsWith(`${hash}-ppm`) && f.endsWith('.png'));
          if (ppmFile) {
            const ppmPath = path.join(PREVIEWS_DIR, ppmFile);
            pngToWebp(ppmPath, thumbPath, THUMB_WIDTH);
            pngToWebp(ppmPath, fullWebpPath, null);
            fs.unlinkSync(ppmPath);
            previews[url] = thumbFile;
            console.log(`    -> ${thumbFile}, ${hash}-full.webp`);
          }
        } catch (err) {
          console.log(`  FAILED (PDF): ${url} — ${err.message}`);
        } finally {
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        }
        throw { _pdfDone: true }; // break to finally block
      }

      console.log(`  capture: ${url}${isArchiveOrg ? ' (archive.org — extended timeout)' : ''}`);
      const waitStrategy = skipBlocking ? 'domcontentloaded' : 'networkidle2';
      const navUrl = screenshotUrl || url;
      const response = await page.goto(navUrl, { waitUntil: waitStrategy, timeout: pageTimeout });
      const status = response ? response.status() : 0;

      if (status === 404 || status === 410) {
        console.error(`  ERROR: ${url} returned ${status} — broken link!`);
        errors.push({ url, status });
        continue;
      }

      if (status >= 400) {
        console.log(`  SKIP (HTTP ${status}): ${url}`);
        continue;
      }

      await new Promise(r => setTimeout(r, loadWait));

      // Try og:image first — prefer the site's own preview image
      try {
        const ogImage = await page.evaluate(() => {
          const meta = document.querySelector('meta[property="og:image"]')
            || document.querySelector('meta[name="twitter:image"]');
          return meta ? meta.getAttribute('content') : null;
        });
        if (ogImage) {
          const imgUrl = ogImage.startsWith('http') ? ogImage : new URL(ogImage, page.url()).href;
          const ext = imgUrl.match(/\.(jpe?g|png|webp|gif)/i)?.[1] || 'jpg';
          const tmpImg = path.join(PREVIEWS_DIR, `${hash}-og.${ext}`);
          console.log(`    found og:image: ${imgUrl}`);
          if (await downloadFile(imgUrl, tmpImg)) {
            // Validate: reject if too small or not actually an image
            const imgSize = fs.statSync(tmpImg).size;
            let isImage = false;
            try { const head = fs.readFileSync(tmpImg, { length: 16 }); isImage = /^\x89PNG|^\xff\xd8\xff|^RIFF/.test(head.toString('binary')); } catch (_) {}
            if (imgSize < 10000 || !isImage) {
              console.log(`    og:image invalid (${imgSize} bytes, isImage=${isImage}), falling back to screenshot`);
              fs.unlinkSync(tmpImg);
            } else {
              const thumbOk = imgToWebp(tmpImg, thumbPath, THUMB_WIDTH);
              const fullOk = imgToWebp(tmpImg, fullWebpPath, null);
              fs.unlinkSync(tmpImg);
              if (thumbOk && fullOk) {
                previews[url] = thumbFile;
                console.log(`    -> ${thumbFile} (from og:image)`);
                throw { _ogDone: true }; // break to finally block
              }
            }
          }
        }
      } catch (_) {}

      // For consent-gated sites: set cookie on resolved domain and reload
      if (page._needsConsentReload) {
        const resolvedUrl = page.url();
        const domain = new URL(resolvedUrl).hostname.replace(/^www\./, '');
        console.log(`    setting consent cookie on .${domain}, reloading...`);
        await page.setCookie(
          { name: 'OptanonAlertBoxClosed', value: new Date().toISOString(), domain: `.${domain}`, path: '/' },
          { name: 'OptanonConsent', value: 'isGpcEnabled=0&datestamp=' + encodeURIComponent(new Date().toISOString()) + '&version=202409.2.0&isIABGlobal=false&hosts=&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A0%2CC0004%3A0', domain: `.${domain}`, path: '/' },
        );
        await page.reload({ waitUntil: 'domcontentloaded', timeout: pageTimeout });
        await new Promise(r => setTimeout(r, 3000));
      }

      // Force-click any "Reject All" style button via CDP Input.dispatchMouseEvent
      // This bypasses all JS event interception
      try {
        const consentBtn = await page.evaluateHandle(() => {
          const buttons = [...document.querySelectorAll('button')];
          return buttons.find(b => /reject all|reject/i.test(b.innerText.trim()) && b.offsetParent !== null)
            || buttons.find(b => /accept all|accept/i.test(b.innerText.trim()) && b.offsetParent !== null);
        });
        if (consentBtn) {
          const box = await consentBtn.boundingBox();
          if (box) {
            const cdp = await page.createCDPSession();
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
            await cdp.detach();
            console.log('    clicked consent button via CDP');
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      } catch (_) {}

      // Dismiss Wayback Machine toolbar if present
      if (isArchiveOrg) {
        try {
          await page.evaluate(() => {
            const closeBtn = document.querySelector('#wm-bnav .iconochive-remove-circle')
              || document.querySelector('#__wb_wombat_ui .iconochive-remove-circle')
              || document.querySelector('#wm-bnav button[title="Close"]');
            if (closeBtn) closeBtn.click();
            // Also remove the toolbar container entirely as fallback
            const toolbar = document.getElementById('wm-iba-container') || document.getElementById('wm-iba');
            if (toolbar) toolbar.remove();
            // Remove the donation banner if present
            const donate = document.getElementById('donato');
            if (donate) donate.remove();
          });
          await new Promise(r => setTimeout(r, 1000));
        } catch (_) {}
      }

      // Try dismissing cookie banners up to 5 times (layered dialogs, preference centers)
      for (let attempt = 0; attempt < 5; attempt++) {
        const dismissed = await dismissCookieBanners(page);
        if (!dismissed) break;
        console.log(`    dismissed banner (attempt ${attempt + 1})`);
      }

      // Nuclear option: force-remove all consent overlays, backdrops, and iframes
      await page.evaluate(() => {
        // Remove known consent SDK containers
        const overlaySelectors = [
          '#onetrust-consent-sdk', '#onetrust-banner-sdk', '#onetrust-pc-sdk',
          '.onetrust-pc-dark-filter', '#ot-sdk-btn-floating',
          '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',
          '.fc-consent-root', '.fc-dialog-overlay',
          '.modal-container', '[class*="modal-backdrop"]',
          '[class*="cookie-banner" i]', '[class*="cookie-consent" i]', '[class*="consent-banner" i]',
          '[id*="cookie-banner" i]', '[id*="cookie-consent" i]',
          '.privacy-cp-container', '#didomi-host', '#didomi-popup',
          '[class*="CookieBanner"]', '[class*="gdpr"]',
          '[class*="privacy" i][class*="choice" i]',
          '[class*="privacy" i][class*="center" i]',
        ];
        for (const sel of overlaySelectors) {
          document.querySelectorAll(sel).forEach(el => el.remove());
        }
        // Remove consent-related iframes
        document.querySelectorAll('iframe').forEach(iframe => {
          const src = (iframe.src || '').toLowerCase();
          if (src.includes('onetrust') || src.includes('cookielaw') || src.includes('consent') || src.includes('privacy')) {
            iframe.remove();
          }
        });
        // Remove any fixed/sticky overlays covering the page (z-index > 100)
        document.querySelectorAll('*').forEach(el => {
          const style = getComputedStyle(el);
          if ((style.position === 'fixed' || style.position === 'sticky') && parseInt(style.zIndex) > 100) {
            const rect = el.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.4 && rect.height > 40) {
              el.remove();
            }
          }
        });
        // Restore scrolling on body (consent overlays often disable it)
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      });
      // Last resort: find "Privacy Choices" heading and scroll past it,
      // then remove everything above the scroll position
      await page.evaluate(() => {
        // Nuke OneTrust SDK elements
        document.querySelectorAll(
          '#onetrust-consent-sdk, .onetrust-pc-dark-filter, [class*="optanon"], [class*="ot-sdk"]'
        ).forEach(e => e.remove());

        // Find the consent heading and hide everything from it up
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (/privacy\s*choices/i.test(walker.currentNode.textContent)) {
            // Walk up to find the section container
            let section = walker.currentNode.parentElement;
            while (section && section.parentElement !== document.body) {
              section = section.parentElement;
            }
            // Hide this section and all previous siblings
            if (section) {
              let el = section;
              while (el) {
                const prev = el.previousElementSibling;
                el.style.display = 'none';
                el = prev;
              }
            }
            break;
          }
        }
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
      });

      // Wait 5s after cookie cleanup, plus any per-publication extra wait
      await new Promise(r => setTimeout(r, 5000 + (extraWait * 1000)));

      // Capture viewport crop for thumbnail
      const thumbPng = pngPath.replace('.png', '-thumb.png');
      await page.screenshot({
        path: thumbPng,
        type: 'png',
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height }
      });
      pngToWebp(thumbPng, thumbPath, THUMB_WIDTH);
      fs.unlinkSync(thumbPng);

      // Capture full scrollable page for detail view (cap at 16383px — webp limit at 2x DPI)
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      const captureHeight = Math.min(Math.max(bodyHeight, VIEWPORT.height), Math.floor(16383 / VIEWPORT.deviceScaleFactor));
      await page.screenshot({
        path: pngPath,
        type: 'png',
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: captureHeight }
      });
      pngToWebp(pngPath, fullWebpPath, VIEWPORT.width);

      // Remove intermediate PNG
      fs.unlinkSync(pngPath);

      previews[url] = thumbFile;
      console.log(`    -> ${thumbFile}, ${hash}-full.webp`);
    } catch (err) {
      if (!err._ogDone && !err._pdfDone) {
        console.log(`  FAILED: ${url} — ${err.message}`);
        if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
      }
    } finally {
      await page.close();
    }
  }

  await browser.close();
  savePreviews(previews);
  console.log(`Done. ${Object.keys(previews).length} total previews.`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} broken link(s) detected:`);
    for (const { url, status } of errors) {
      console.error(`  ${status} ${url}`);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
