import puppeteer from 'puppeteer'
import { setTimeout } from 'node:timers/promises'

const args = ['--no-sandbox', '--disable-setuid-sandbox']
if (process.env.PROXY_SERVER) {
    const proxy_url = new URL(process.env.PROXY_SERVER)
    proxy_url.username = ''
    proxy_url.password = ''
    args.push(`--proxy-server=${proxy_url}`.replace(/\/$/, ''))
}

const browser = await puppeteer.launch({
    defaultViewport: { width: 1080, height: 1024 },
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

    // 等待 Cloudflare iframe 加载
    await setTimeout(2000)
    try {
        // 等待 iframe 出现
        await page.waitForSelector('iframe[src*="cloudflare"]', { timeout: 5000 })
        const iframeElement = await page.$('iframe[src*="cloudflare"]')
        const iframe = await iframeElement.contentFrame()
        await iframe.waitForSelector('input[type="checkbox"]', { timeout: 5000 })
        await iframe.click('input[type="checkbox"]')
        console.log('Cloudflare checkbox clicked')
        await setTimeout(3000)
    } catch (cfError) {
        console.log('Cloudflare处理失败:', cfError.message)
    }

    await page.locator('text=無料VPSの利用を継続する').click()
        console.log('Cloudflare处理失败:', cfError.message)
    }

    await page.locator('text=無料VPSの利用を継続する').click()

