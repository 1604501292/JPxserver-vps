import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { setTimeout } from 'node:timers/promises'

puppeteer.use(StealthPlugin())

const args = [
    '--no-sandbox', 
    '--disable-setuid-sandbox',
    '--window-size=1080,1024',
    '--disable-blink-features=AutomationControlled'
]

if (process.env.PROXY_SERVER) {
    const proxy_url = new URL(process.env.PROXY_SERVER)
    proxy_url.username = ''
    proxy_url.password = ''
    args.push(`--proxy-server=${proxy_url}`.replace(/\/$/, ''))
}

// 👇 关键修改：关闭 headless，依托外部 xvfb 模拟真实显示器
const browser = await puppeteer.launch({
    headless: false, 
    defaultViewport: null,
    args,
})
const [page] = await browser.pages()

const userAgent = await browser.userAgent()
await page.setUserAgent(userAgent.replace('Headless', ''))
const recorder = await page.screencast({ path: 'recording.webm' })

try {
    if (process.env.PROXY_SERVER) {
        const { username, password } = new URL(process.env.PROXY_SERVER)
        if (username && password) {
            await page.authenticate({ username, password })
        }
    }

    await page.goto('https://secure.xserver.ne.jp/xapanel/login/xvps/', { waitUntil: 'networkidle2' })
    await page.locator('#memberid').fill(process.env.EMAIL)
    await page.locator('#user_password').fill(process.env.PASSWORD)
    await page.locator('text=ログインする').click()
    
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    await page.locator('a[href^="/xapanel/xvps/server/detail?id="]').click()
    await page.locator('text=更新する').click()
    await page.locator('text=引き続き無料VPSの利用を継続する').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    const body = await page.$eval('img[src^="data:"]', img => img.src)
    const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { method: 'POST', body }).then(r => r.text())
    await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)

    console.log('开始处理 Cloudflare 验证...')
    try {
        await page.waitForSelector('[name="cf-turnstile-response"]', { timeout: 10000 })
        const isVerified = await page.$eval('[name="cf-turnstile-response"]', el => el.value !== '')
        
        if (!isVerified) {
            console.log('定位 Cloudflare iframe...')
            const cfIframe = await page.waitForSelector('iframe[src*="cloudflare"]', { timeout: 5000 })
            if (cfIframe) {
                // 等待验证组件完全渲染
                await setTimeout(3000)
                const box = await cfIframe.boundingBox()
                if (box) {
                    // 👇 关键修改：加入鼠标移动轨迹，并且点击 X 坐标偏移到左侧框框处 (box.x + 35)
                    const targetX = box.x + 35
                    const targetY = box.y + box.height / 2
                    await page.mouse.move(targetX, targetY, { steps: 15 })
                    await setTimeout(800)
                    await page.mouse.click(targetX, targetY)
                    await setTimeout(2000)
                }
            }

            await page.waitForFunction(() => {
                const el = document.querySelector('[name="cf-turnstile-response"]')
                return el && el.value !== ''
            }, { timeout: 15000 })
            console.log('✅ 验证通过！')
        }
    } catch (cfError) {
        console.log('⚠️ 验证检测超时，尝试直接继续...')
    }

    await page.locator('text=無料VPSの利用を継続する').click()
    await setTimeout(5000)
    
} catch (e) {
    console.error(e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
