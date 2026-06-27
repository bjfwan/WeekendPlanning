/**
 * 分享弹窗真实截图脚本（不注入 fetch mock）
 *
 * 用法：node docs/capture-share-modal.js
 *
 * 输出：docs/screenshots/06-share-modal-real.png
 *
 * 与 capture-screens.js 的区别：
 *  - 不注入 fetch mock，走真实 /api/plan/save
 *  - 只截分享弹窗这一步
 *  - 分享弹窗等待超时延长（真实网络请求）
 */

import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = 'https://weekend-planning-rouge.vercel.app'
const OUT_DIR = path.join(__dirname, 'screenshots')
const OUT_FILE = path.join(OUT_DIR, '06-share-modal-real.png')

const VIEWPORT = { width: 1440, height: 900 }
const AI_TIMEOUT = 90_000      // AI 生成最长等待
const MAP_WAIT = 12_000        // 地图瓦片额外等待
const SHARE_MODAL_TIMEOUT = 30_000 // 分享弹窗等待（真实网络请求）

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const log = (...a) => console.log('[share-capture]', ...a)
const warn = (...a) => console.warn('[share-capture][WARN]', ...a)

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function clickByText(page, text, options = {}) {
  const loc = page.getByRole('button', { name: new RegExp(escapeRegex(text), 'i') })
  await loc.first().waitFor({ state: 'visible', timeout: options.timeout || 10_000 })
  await loc.first().click({ timeout: options.timeout || 10_000 })
  return loc
}

async function waitForPath(page, pathSub, timeout = 30_000) {
  await page.waitForURL(`**${pathSub}**`, { timeout, waitUntil: 'load' })
}

;(async () => {
  log('启动 chromium (headless)')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: 'zh-CN'
  })

  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(60_000)

  // 监听控制台，便于诊断分享失败
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      log(`[console.${msg.type()}]`, msg.text())
    }
  })

  let resultReady = false

  // ============ 1. 访问首页 ============
  try {
    log('访问首页:', BASE_URL)
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('h1', { timeout: 20_000 })
    await page.waitForTimeout(2500)
    log('首页加载完成')
  } catch (e) {
    warn('首页加载失败:', e.message)
  }

  // ============ 2. 点击「一键填充示例」 ============
  try {
    log('点击「一键填充示例」')
    await clickByText(page, '一键填充示例', { timeout: 10_000 })
    await page.waitForTimeout(1500)
    log('示例已填充')
  } catch (e) {
    warn('点击「一键填充示例」失败:', e.message)
  }

  // ============ 3. 点击「生成行程」 ============
  try {
    log('点击「生成周末行程」')
    const submitBtn = page.getByRole('button', { name: /生成周末行程|正在准备/ })
    await submitBtn.first().waitFor({ state: 'visible', timeout: 8_000 })
    await submitBtn.first().click()

    log('等待跳转到 /plan')
    await waitForPath(page, '/plan', 30_000).catch(() =>
      warn('未检测到 /plan 跳转，继续尝试')
    )

    log('等待 StreamingPanel 出现')
    const streamingVisible = await page
      .waitForSelector('text=/理解需求|生成方案|AI 正在思考|正在生成/', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)

    if (streamingVisible) {
      log('StreamingPanel 已出现，等待生成完成')
    } else {
      warn('StreamingPanel 未出现，可能生成过快已完成')
    }
  } catch (e) {
    warn('点击生成按钮失败:', e.message)
  }

  // ============ 4. 等待 AI 生成完成 ============
  log('等待 AI 生成完成（最长 ' + AI_TIMEOUT / 1000 + 's）')
  try {
    await page
      .waitForSelector('text=/当日路线地图|总花费|出行准备清单/', { timeout: AI_TIMEOUT })
      .then(() => {
        resultReady = true
        log('检测到结果区域，生成完成')
      })
      .catch(() => warn('AI 生成等待超时'))
  } catch (e) {
    warn('生成完成检测异常:', e.message)
  }

  // 兜底：加载演示行程
  if (!resultReady) {
    log('尝试 demo 兜底：点击「🎯 加载演示行程」')
    try {
      const demoBtn = page.getByRole('button', { name: /加载演示行程/ })
      await demoBtn.first().waitFor({ state: 'visible', timeout: 15_000 })
      await demoBtn.first().click()
      await page
        .waitForSelector('text=/当日路线地图|总花费/', { timeout: 30_000 })
        .then(() => {
          resultReady = true
          log('演示行程已加载')
        })
        .catch(() => warn('演示行程加载超时'))
    } catch (e) {
      warn('demo 兜底失败:', e.message)
    }
  }

  if (resultReady) await page.waitForTimeout(2000)

  // ============ 5. 点击分享按钮 + 等待真实分享弹窗 ============
  let shareOk = false
  let shareErr = ''
  let shareCodeText = ''

  if (!resultReady) {
    warn('结果未就绪，无法打开分享弹窗')
  } else {
    // 关键：等待 status === 'done' 的标志——分享按钮 v-if="status === 'done' && currentPlan"
    // 结果区域文字在流式输出时就可能出现，但分享按钮要等 status 切到 done 才渲染
    log('等待分享按钮出现（status === done 的标志，最长 40s）')
    const shareBtnLocator = page.locator('button:has-text("分享链接")')
    const retryBtnLocator = page.locator('button:has-text("重新生成")')
    let statusDone = false
    try {
      await Promise.race([
        shareBtnLocator.first().waitFor({ state: 'visible', timeout: 40_000 }),
        retryBtnLocator.first().waitFor({ state: 'visible', timeout: 40_000 })
      ])
      statusDone = true
      log('检测到 done 标志按钮（分享/重新生成），status 应为 done')
    } catch (e) {
      warn('分享/重新生成按钮未在 40s 内出现，status 可能未变为 done')
    }
    // 额外等待状态稳定
    await page.waitForTimeout(1500)

    // 弹窗文案定位器
    const modalLoc = page.locator('text=/分享链接已生成|复制链接|打开链接/').first()
    const errLoc = page.locator('text=/生成分享链接失败|用户身份未就绪|请求失败|分享失败/').first()

    for (let attempt = 1; attempt <= 3 && !shareOk; attempt++) {
      log(`分享尝试 ${attempt}/3（走真实 /api/plan/save，无 mock）`)
      try {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(800)

        const shareBtn = page.locator('button:has-text("分享链接")').first()
        const btnVisible = await shareBtn.isVisible().catch(() => false)

        if (btnVisible) {
          await shareBtn.scrollIntoViewIfNeeded({ timeout: 8_000 }).catch(() => {})
          await shareBtn.click({ timeout: 10_000 })
        } else {
          warn(`尝试${attempt}: Playwright 定位不到分享按钮，用 evaluate 兜底点击`)
          const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'))
            const btn = btns.find((b) => (b.textContent || '').includes('分享链接'))
            if (btn) {
              btn.click()
              return true
            }
            return false
          })
          if (!clicked) {
            shareErr = '分享按钮不在 DOM 中（可能 status !== done）'
            await page.waitForTimeout(2000)
            continue
          }
        }

        // race: 等待弹窗 OR 错误提示 任一出现
        await Promise.race([
          modalLoc.waitFor({ state: 'visible', timeout: SHARE_MODAL_TIMEOUT }).then(() => true),
          errLoc.waitFor({ state: 'visible', timeout: SHARE_MODAL_TIMEOUT }).then(() => false)
        ])
          .then((v) => (shareOk = v))
          .catch(() => {})

        if (shareOk) {
          log('分享弹窗已打开（真实分享）')
          // 提取分享链接/分享码文本用于确认是否真实
          try {
            const linkEl = page.locator('input, [class*="share"], [class*="link"]').first()
            if (await linkEl.count()) {
              shareCodeText = (await linkEl.inputValue().catch(() => '')) ||
                              (await linkEl.textContent().catch(() => ''))
            }
            // 也尝试从页面文本里找 shareCode
            if (!shareCodeText) {
              const bodyText = await page.evaluate(() => document.body.innerText)
              const m = bodyText.match(/shareCode[^\n]*?([\w-]{6,})/)
              if (m) shareCodeText = m[1]
            }
          } catch (e) {
            warn('提取分享码文本失败:', e.message)
          }
          break
        }
        shareErr = (await errLoc.textContent().catch(() => '')) || '超时未响应'
        warn(`分享尝试 ${attempt} 失败: ${shareErr}`)
        await page.waitForTimeout(2500)
      } catch (e) {
        shareErr = e.message
        warn(`分享尝试 ${attempt} 异常: ${shareErr}`)
        await page.waitForTimeout(2000)
      }
    }
  }

  // ============ 6. 截图 ============
  if (shareOk) {
    await page.waitForTimeout(1500) // 等入场动画
    await page.screenshot({ path: OUT_FILE, fullPage: false })
    log(`✓ 截图成功: ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB)`)
    if (shareCodeText) {
      log(`分享码文本: ${shareCodeText}`)
      log(`是否 demo 码: ${/demo-share-code/i.test(shareCodeText) ? '是（仍是 mock）' : '否（真实分享码）'}`)
    }
  } else {
    warn('分享弹窗未能打开，兜底截图当前页面')
    await page.screenshot({ path: OUT_FILE, fullPage: false })
    log(`✗ 截图（失败兜底）: ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB)`)
    log(`失败原因: ${shareErr}`)
  }

  await context.close()
  await browser.close()
  process.exit(shareOk ? 0 : 1)
})().catch((e) => {
  console.error('[share-capture][致命错误]', e)
  process.exit(2)
})
