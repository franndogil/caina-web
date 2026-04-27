const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const HANDLE = 'caina.stickers';

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, response => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(filepath, () => {}); reject(err); });
  });
}

async function scrapeInstagram() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
  });

  const page = await context.newPage();
  const data = { handle: HANDLE, posts: [] };

  console.log(`Abriendo perfil de @${HANDLE}...`);
  await page.goto(`https://www.instagram.com/${HANDLE}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check if we need to handle cookie consent
  try {
    const cookieBtn = page.locator('button:has-text("Allow"), button:has-text("Aceptar"), button:has-text("Accept All")');
    if (await cookieBtn.count() > 0) {
      await cookieBtn.first().click();
      await page.waitForTimeout(1500);
    }
  } catch(e) {}

  // Try to close login modal if present
  try {
    const closeBtn = page.locator('[aria-label="Close"], [aria-label="Cerrar"]');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
      await page.waitForTimeout(1000);
    }
  } catch(e) {}

  // Extract profile data from page
  console.log('Extrayendo datos del perfil...');

  const profileData = await page.evaluate(() => {
    const result = {};

    // Try to get data from window._sharedData or similar
    try {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      for (const script of scripts) {
        const text = script.textContent;
        if (text && text.includes('edge_followed_by')) {
          const json = JSON.parse(text);
          const user = json?.data?.user || json?.graphql?.user;
          if (user) {
            result.username = user.username;
            result.fullName = user.full_name;
            result.bio = user.biography;
            result.followers = user.edge_followed_by?.count;
            result.following = user.edge_follow?.count;
            result.postsCount = user.edge_owner_to_timeline_media?.count;
            result.profilePicUrl = user.profile_pic_url_hd || user.profile_pic_url;
            result.isVerified = user.is_verified;
            result.externalUrl = user.external_url;
            const edges = user.edge_owner_to_timeline_media?.edges || [];
            result.posts = edges.slice(0, 12).map(e => ({
              url: e.node.display_url,
              thumbnailUrl: e.node.thumbnail_src || e.node.display_url,
              caption: e.node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
              likes: e.node.edge_liked_by?.count || e.node.edge_media_preview_like?.count || 0,
              isVideo: e.node.is_video,
              shortcode: e.node.shortcode,
            }));
            return result;
          }
        }
      }
    } catch(e) {}

    // Fallback: extract from DOM
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) result.metaDescription = metaDesc.getAttribute('content');

    const title = document.querySelector('title');
    if (title) result.pageTitle = title.textContent;

    // Try to get stats from DOM
    const statValues = [];
    document.querySelectorAll('li span span, header section ul li span').forEach(el => {
      const text = el.textContent.trim();
      if (text && !isNaN(text.replace(/[.,KkMm]/g, ''))) {
        statValues.push(text);
      }
    });
    result.statValues = statValues;

    return result;
  });

  Object.assign(data, profileData);

  // Try to get profile picture from meta tags if not found
  if (!data.profilePicUrl) {
    data.profilePicUrl = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:image"]');
      return og ? og.getAttribute('content') : null;
    });
  }

  // Try to get bio from meta if not found
  if (!data.bio && data.metaDescription) {
    const match = data.metaDescription.match(/•(.+?)(?:\s*\d+\s*(?:Followers|Seguidores)|$)/);
    if (match) data.bio = match[1].trim();
  }

  // Take a screenshot
  await page.screenshot({ path: 'assets/instagram_screenshot.png', fullPage: false });

  // Try to get post images from the page
  if (!data.posts || data.posts.length === 0) {
    console.log('Intentando extraer posts del DOM...');
    data.posts = await page.evaluate(() => {
      const imgs = [];
      document.querySelectorAll('article img, main img[srcset]').forEach(img => {
        if (img.src && img.src.includes('instagram') && !img.src.includes('profile')) {
          imgs.push({ url: img.src, caption: img.alt || '', likes: 0, isVideo: false });
        }
      });
      return imgs.slice(0, 12);
    });
  }

  await browser.close();

  // Download profile picture
  if (data.profilePicUrl) {
    console.log('Descargando foto de perfil...');
    try {
      await downloadImage(data.profilePicUrl, 'assets/profile_pic.jpg');
      data.localProfilePic = 'assets/profile_pic.jpg';
      console.log('Foto de perfil descargada.');
    } catch(e) {
      console.log('No se pudo descargar la foto de perfil:', e.message);
    }
  }

  // Download post images
  if (data.posts && data.posts.length > 0) {
    console.log(`Descargando ${data.posts.length} fotos de posts...`);
    for (let i = 0; i < data.posts.length; i++) {
      const post = data.posts[i];
      const imgUrl = post.url || post.thumbnailUrl;
      if (imgUrl) {
        try {
          const filepath = `assets/post_${i + 1}.jpg`;
          await downloadImage(imgUrl, filepath);
          post.localPath = filepath;
          process.stdout.write(`  Post ${i+1}/${data.posts.length} descargado\r`);
        } catch(e) {
          // skip
        }
      }
    }
    console.log('\nPosts descargados.');
  }

  fs.writeFileSync('assets/instagram_data.json', JSON.stringify(data, null, 2));
  console.log('\nDatos guardados en assets/instagram_data.json');
  console.log('\n=== DATOS ENCONTRADOS ===');
  console.log('Usuario:', data.username || data.handle);
  console.log('Nombre:', data.fullName || '(no encontrado)');
  console.log('Bio:', data.bio || '(no encontrado)');
  console.log('Seguidores:', data.followers || '(no encontrado)');
  console.log('Posts:', data.postsCount || data.posts?.length || 0);
  console.log('Verificado:', data.isVerified ? 'Sí' : 'No');
  console.log('URL externa:', data.externalUrl || '(ninguna)');
  console.log('Fotos de posts:', data.posts?.length || 0);

  return data;
}

scrapeInstagram().catch(err => {
  console.error('Error en el scraper:', err.message);
  process.exit(1);
});
