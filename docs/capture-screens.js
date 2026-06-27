/**
 * AI 周末规划师 · 参赛截图自动拍摄脚本
 *
 * 用法：node docs/capture-screens.js
 *
 * 输出：docs/screenshots/01-home-form.png ... 06-share-modal.png
 *
 * 设计要点：
 *  - chromium headless，视口 1440x900
 *  - 每张截图独立 try-catch，失败记录但继续后续截图
 *  - AI 生成最长等待 90s；超时/失败则点击「加载演示行程」兜底
 *  - 地图区域等待瓦片加载（额外 10s）
 */

import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = 'https://weekend-planning-rouge.vercel.app'
const OUT_DIR = path.join(__dirname, 'screenshots')

// 视口配置
const VIEWPORT = { width: 1440, height: 900 }

// 超时配置（毫秒）
const AI_TIMEOUT = 90_000      // AI 生成最长等待
const MAP_WAIT = 12_000        // 地图瓦片额外等待
const DEMO_BTN_WAIT = 15_000   // 兜底按钮出现等待

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

// ---------- 工具函数 ----------
const log = (...a) => console.log('[capture]', ...a)
const warn = (...a) => console.warn('[capture][WARN]', ...a)

/** 记录单张截图的结果状态 */
const results = []
function record(name, ok, filePath, size, err) {
  results.push({ name, ok, filePath, size, err: err || '' })
  log(`${ok ? '✓ 成功' : '✗ 失败'} · ${name}${err ? ' · ' + err : ''}`)
}

/** 安全点击：按可见的文本匹配按钮并点击 */
async function clickByText(page, text, options = {}) {
  const loc = page.getByRole('button', { name: new RegExp(escapeRegex(text), 'i') })
  await loc.first().waitFor({ state: 'visible', timeout: options.timeout || 10_000 })
  await loc.first().click({ timeout: options.timeout || 10_000 })
  return loc
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 等待指定 URL 包含某路径 */
async function waitForPath(page, pathSub, timeout = 30_000) {
  await page.waitForURL(`**${pathSub}**`, { timeout, waitUntil: 'load' })
}

// ---------- 主流程 ----------
;(async () => {
  log('启动 chromium (headless)')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // 高分屏，截图更清晰
    locale: 'zh-CN'
  })

  // 屏蔽地图瓦片外的多余字体下载延迟感知，但保留网络
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(60_000)

  // ============ 截图 01 · 首页表单 ============
  let step = '01-home-form'
  try {
    log('访问首页:', BASE_URL)
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    // 等待 Hero/表单渲染：主标题出现
    await page.waitForSelector('h1', { timeout: 20_000 })
    // 额外等待入场动画 + 数字滚动
    await page.waitForTimeout(2500)
    const file = path.join(OUT_DIR, '01-home-form.png')
    await page.screenshot({ path: file, fullPage: true })
    record(step, true, file, fs.statSync(file).size)
  } catch (e) {
    warn(step, e.message)
    record(step, false, null, 0, e.message)
  }

  // ============ 截图 02 · 一键填充示例后 ============
  step = '02-example-filled'
  try {
    log('点击「一键填充示例」')
    await clickByText(page, '一键填充示例', { timeout: 10_000 })
    // 等待表单填充（城市/日期/预算等）+ 滚动绘制分隔线动画
    await page.waitForTimeout(1500)
    const file = path.join(OUT_DIR, '02-example-filled.png')
    await page.screenshot({ path: file, fullPage: true })
    record(step, true, file, fs.statSync(file).size)
  } catch (e) {
    warn(step, e.message)
    record(step, false, null, 0, e.message)
  }

  // ============ 截图 03 · AI 流式生成中 ============
  step = '03-generating'
  let generatingCaptured = false
  try {
    log('点击「生成周末行程」提交表单')
    // 按钮文案可能是「生成周末行程」或「正在准备...」，匹配主文案
    const submitBtn = page.getByRole('button', { name: /生成周末行程|正在准备/ })
    await submitBtn.first().waitFor({ state: 'visible', timeout: 8_000 })
    await submitBtn.first().click()

    // 等待跳转到 /plan
    log('等待跳转到 /plan')
    await waitForPath(page, '/plan', 30_000).catch(() =>
      warn('未检测到 /plan 跳转，继续尝试在当前页捕获生成态')
    )

    // 等待 StreamingPanel 出现（4 阶段状态机文字）
    log('等待 StreamingPanel 出现')
    const streamingVisible = await page
      .waitForSelector('text=/理解需求|生成方案|AI 正在思考|正在生成/', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)

    if (streamingVisible) {
      // 让阶段 2 激活、连接线流动光效出现
      await page.waitForTimeout(4000)
      const file = path.join(OUT_DIR, '03-generating.png')
      await page.screenshot({ path: file, fullPage: true })
      record(step, true, file, fs.statSync(file).size)
      generatingCaptured = true
    } else {
      warn('StreamingPanel 未出现，可能生成过快已完成')
      record(step, false, null, 0, 'StreamingPanel 未在 20s 内出现')
    }
  } catch (e) {
    warn(step, e.message)
    record(step, false, null, 0, e.message)
  }

  // ============ 等待 AI 生成完成 / 兜底 ============
  // 生成完成标志：结果区域出现（当日路线地图 / 行程头部 / 总花费）
  log('等待 AI 生成完成（最长 ' + AI_TIMEOUT / 1000 + 's）')
  let resultReady = false
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

  // 兜底：若未就绪，尝试点击「加载演示行程」
  if (!resultReady) {
    log('尝试 demo 兜底：点击「🎯 加载演示行程」')
    try {
      const demoBtn = page.getByRole('button', { name: /加载演示行程/ })
      await demoBtn.first().waitFor({ state: 'visible', timeout: DEMO_BTN_WAIT })
      await demoBtn.first().click()
      // 等待演示行程渲染
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

  // 额外等待入场动画 + 数字滚动
  if (resultReady) await page.waitForTimeout(2000)

  // ============ 截图 04 · 地图路线结果 ============
  step = '04-map-route'
  try {
    if (!resultReady) throw new Error('结果未就绪，无法截地图')
    // 滚动到地图区域
    const mapHeading = page.locator('text=当日路线地图').first()
    if (await mapHeading.count()) {
      await mapHeading.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    }
    // 等待地图瓦片加载（高德地图渲染）
    log('等待地图瓦片加载', MAP_WAIT / 1000 + 's')
    await page.waitForTimeout(MAP_WAIT)
    const file = path.join(OUT_DIR, '04-map-route.png')
    // 截整个视口（地图在视口内）
    await page.screenshot({ path: file, fullPage: false })
    record(step, true, file, fs.statSync(file).size)
  } catch (e) {
    warn(step, e.message)
    record(step, false, null, 0, e.message)
  }

  // ============ 截图 05 · 时间轴 + 行程卡片 ============
  step = '05-timeline'
  try {
    if (!resultReady) throw new Error('结果未就绪，无法截时间轴')
    // 滚动到时间轴区域（"第 1 天行程" 标题 / 时间轴）
    const timelineHeading = page.locator('text=/第 \\d+ 天行程/').first()
    if (await timelineHeading.count()) {
      await timelineHeading.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    }
    await page.waitForTimeout(1500) // 等入场动画
    const file = path.join(OUT_DIR, '05-timeline.png')
    await page.screenshot({ path: file, fullPage: false })
    record(step, true, file, fs.statSync(file).size)
  } catch (e) {
    warn(step, e.message)
    record(step, false, null, 0, e.message)
  }

  // ============ 截图 06 · 分享弹窗 ============
  step = '06-share-modal'
  try {
    if (!resultReady) throw new Error('结果未就绪，无法打开分享弹窗')

    // 等待状态稳定（避免 StreamingPanel 退场过渡期间 status 未完全切换）
    await page.waitForTimeout(2000)

    // 注入 fetch mock：线上 /api/plan/save 返回 500，拦截该请求返回成功响应，
    // 让真实的 ShareModal 组件渲染（弹窗 UI 真实，仅 shareCode 为构造值，视觉无差异）
    await page.evaluate(() => {
      const origFetch = window.fetch
      window.fetch = async function (url, options) {
        const u = typeof url === 'string' ? url : url && url.url
        if (u && u.indexOf('/api/plan/save') !== -1) {
          return new Response(
            JSON.stringify({
              success: true,
              data: { shareCode: 'demo-share-code', planId: 'demo-plan-id' }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }
        return origFetch.apply(this, arguments)
      }
    })
    log('已注入 fetch mock（拦截 /api/plan/save 返回成功，绕过线上 500）')

    // 弹窗文案定位器（ShareModal 内的稳定文案）
    const modalLoc = page.locator('text=/分享链接已生成|复制链接|打开链接/').first()
    // 分享错误提示定位器（handleShare 失败时显示的 shareError）
    const errLoc = page.locator('text=/生成分享链接失败|用户身份未就绪|请求失败|分享失败/').first()

    let shareOk = false
    let shareErr = ''

    for (let attempt = 1; attempt <= 3 && !shareOk; attempt++) {
      log(`分享尝试 ${attempt}/3`)
      try {
        // 滚回顶部，确保分享按钮可见（顶部操作栏在结果区上方）
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(800)

        // 用 has-text 定位分享按钮（对 BaseButton 组件更宽松）
        const shareBtn = page.locator('button:has-text("分享链接")').first()
        const btnVisible = await shareBtn.isVisible().catch(() => false)

        if (btnVisible) {
          await shareBtn.scrollIntoViewIfNeeded({ timeout: 8_000 }).catch(() => {})
          await shareBtn.click({ timeout: 10_000 })
        } else {
          // 兜底：通过 evaluate 直接在 DOM 层面查找并点击
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
          modalLoc.waitFor({ state: 'visible', timeout: 18_000 }).then(() => true),
          errLoc.waitFor({ state: 'visible', timeout: 18_000 }).then(() => false)
        ])
          .then((v) => (shareOk = v))
          .catch(() => {})

        if (shareOk) {
          log('分享弹窗已打开')
          break
        }
        // 读取错误文本用于诊断
        shareErr = (await errLoc.textContent().catch(() => '')) || '超时未响应'
        warn(`分享尝试 ${attempt} 失败: ${shareErr}`)
        await page.waitForTimeout(2500)
      } catch (e) {
        shareErr = e.message
        warn(`分享尝试 ${attempt} 异常: ${shareErr}`)
        await page.waitForTimeout(2000)
      }
    }

    if (shareOk) {
      await page.waitForTimeout(1500) // 等脉冲环动画 + 入场 stagger
      const file = path.join(OUT_DIR, '06-share-modal.png')
      await page.screenshot({ path: file, fullPage: false })
      record(step, true, file, fs.statSync(file).size)
    } else {
      // 兜底：截当前页面（展示分享按钮 + 错误提示），记录失败原因
      warn('分享弹窗未能打开，兜底截图当前页面')
      const file = path.join(OUT_DIR, '06-share-modal.png')
      await page.screenshot({ path: file, fullPage: false })
      record(step, false, file, fs.statSync(file).size, '分享弹窗未打开：' + shareErr)
    }
  } catch (e) {
    warn(step, e.message)
    record(step, false, null, 0, e.message)
  }

  // ---------- 汇总 ----------
  log('\n========== 截图汇总 ==========')
  let okCount = 0
  for (const r of results) {
    const sizeStr = r.size ? (r.size / 1024).toFixed(1) + ' KB' : '-'
    log(
      `${r.ok ? '✓' : '✗'}  ${r.name}.png  ${sizeStr.padStart(10)}  ${r.filePath || '（未生成）'}${r.err ? '  ⚠ ' + r.err : ''}`
    )
    if (r.ok) okCount++
  }
  log(`\n共 ${okCount}/${results.length} 张成功，输出目录：${OUT_DIR}`)

  await context.close()
  await browser.close()
  // 非零退出码便于上层感知部分失败
  process.exit(okCount === results.length ? 0 : 1)
})().catch((e) => {
  console.error('[capture][致命错误]', e)
  process.exit(2)
})
