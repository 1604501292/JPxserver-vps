import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { setTimeout } from 'node:timers/promises'

// 启用 Stealth 插件，抹除自动化特征
puppeteer.use(StealthPlugin())

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

// Stealth 插件已经处理了大部分 UA 问题，这里作为双保险保留
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
    
    // 处理图形验证码
    const body = await page.$eval('img[src^="data:"]', img => img.src)
    const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { method: 'POST', body }).then(r => r.text())
    await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)

    // ================= 开始处理 Cloudflare 验证 =================
    console.log('正在检测并处理 Cloudflare 验证...')
    try {
        // 等待 Cloudflare 的隐藏 token 输入框出现
        await page.waitForSelector('[name="cf-turnstile-response"]', { timeout: 10000 })
        
        // 检查是否在使用了 Stealth 插件后已经自动验证通过（免点击）
        const isVerified = await page.$eval('[name="cf-turnstile-response"]', el => el.value !== '')
        
        if (!isVerified) {
            console.log('需要交互，正在模拟点击 Cloudflare 验证框...')
            // 找到 Cloudflare 的 iframe
            const cfIframe = await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { timeout: 5000 })
            if (cfIframe) {
                // 获取 iframe 在页面上的真实坐标，计算出中心点进行物理点击
                const box = await cfIframe.boundingBox()
                if (box) {
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
                    // 稍作等待，让验证动画飞一会儿
                    await setTimeout(2000)
                }
            }

            // 轮询等待隐藏的 token 被填充，代表验证出现绿色打勾
            await page.waitForFunction(() => {
                const el = document.querySelector('[name="cf-turnstile-response"]')
                return el && el.value !== ''
            }, { timeout: 15000 })
            console.log('✅ Cloudflare 验证已通过！')
        } else {
            console.log('✅ Cloudflare 已自动无感验证通过。')
        }
    } catch (cfError) {
        console.log('⚠️ 等待 Cloudflare 验证超时或未找到组件，尝试直接提交...')
    }
    // ================= 结束处理 Cloudflare 验证 =================

    // 提交最终表单
    await page.locator('text=無料VPSの利用を継続する').click()
    
    // 建议在点击提交后多等待一会儿，确保续期请求发送成功
    await setTimeout(5000)
    
} catch (e) {
    console.error(e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
