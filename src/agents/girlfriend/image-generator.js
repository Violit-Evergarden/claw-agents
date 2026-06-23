'use strict';

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../../core/config-loader');

/**
 * Grok 图像生成客户端
 */
class GrokImageGenerator {
  constructor() {
    this.provider = 'grok';
    this.imageDir = path.join(__dirname, '../../../data/images');
    this.ensureImageDir();
  }

  _getClient() {
    const config = loadConfig();
    const grok = config.providers?.grok || {};
    const opts = { apiKey: grok.apiKey, baseURL: grok.baseURL };
    if (grok.proxy) {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      opts.httpAgent = new HttpsProxyAgent(grok.proxy);
    }
    return new OpenAI(opts);
  }

  ensureImageDir() {
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
    }
  }

  /**
   * 生成图片并保存到本地
   * @param {string} prompt - 图片描述（英文）
   * @param {string} style - 图片风格
   * @param {string} aspectRatio - 宽高比，可选：'square', 'portrait', 'landscape'
   * @returns {Promise<{url: string, localPath: string}>} 图片信息
   */
  async generateImage(prompt, style = 'realistic', aspectRatio = 'square') {
    try {
      console.log(`[ImageGenerator] Received parameters: prompt="${prompt}", style="${style}", aspectRatio="${aspectRatio}"`);
      
      // 根据风格调整提示词
      const stylePrompt = this.getStylePrompt(prompt, style);
      
      // 根据宽高比映射到Grok API支持的格式
      const grokAspectRatio = this.getGrokAspectRatio(aspectRatio);
      
      console.log(`[ImageGenerator] Generating image: "${stylePrompt}" (aspect_ratio: ${grokAspectRatio})`);
      
      const response = await this._getClient().images.generate({
        model: 'grok-imagine-image',
        prompt: stylePrompt,
        n: 1,
        aspect_ratio: grokAspectRatio,
        response_format: 'url',
      });

      const imageUrl = response.data[0].url;
      
      let localPath = null;
      try {
        // 尝试下载图片到本地
        localPath = await this.downloadImage(imageUrl);
        console.log(`[ImageGenerator] Image saved to: ${localPath}`);
      } catch (downloadError) {
        console.error('[ImageGenerator] Failed to download image, but generation succeeded:', downloadError.message);
        // 即使下载失败，也继续返回结果
      }
      
      return {
        url: imageUrl,
        localPath,
        style,
        aspectRatio: grokAspectRatio,
        prompt: stylePrompt,
      };
    } catch (error) {
      console.error('[ImageGenerator] Error:', error);
      console.error('[ImageGenerator] Error message:', error.message);
      console.error('[ImageGenerator] Error stack:', error.stack);
      if (error.response) {
        console.error('[ImageGenerator] Response status:', error.response.status);
        console.error('[ImageGenerator] Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`图片生成失败: ${error.message}`);
    }
  }

  /**
   * 将内部宽高比映射到Grok API支持的格式
   */
  getGrokAspectRatio(ratio) {
    console.log(`[ImageGenerator] getGrokAspectRatio called with: "${ratio}"`);
    
    const ratioMap = {
      square: '1:1',      // 正方形
      portrait: '9:16',   // 竖屏
      landscape: '16:9',  // 横屏
    };
    
    const result = ratioMap[ratio] || '1:1';
    console.log(`[ImageGenerator] getGrokAspectRatio result: "${result}"`);
    return result;
  }

  /**
   * 根据风格调整提示词
   */
  getStylePrompt(basePrompt, style) {
    const styleMap = {
      // realistic 不再包装整个 prompt，避免冗余和重复的角色描述
      realistic: basePrompt,
      anime: `anime style, ${basePrompt}, vibrant colors, Japanese anime aesthetic`,
      cartoon: `cartoon style, ${basePrompt}, colorful, fun and playful`,
      artistic: `artistic painting, ${basePrompt}, creative composition, painterly`,
      photographic: `professional photography, ${basePrompt}, high-resolution, camera shot`,
    };
    return styleMap[style] || basePrompt;
  }



  /**
   * 下载图片到本地
   */
  async downloadImage(url) {
    const axios = require('axios');
    const timestamp = Date.now();
    const filename = `image_${timestamp}.png`;
    const filePath = path.join(this.imageDir, filename);

    // 创建axios实例，使用与OpenAI客户端相同的代理配置
    const axiosInstance = axios.create();
    
    // 如果配置了代理，为axios也设置代理
    if (this.proxy) {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      const agent = new HttpsProxyAgent(this.proxy);
      axiosInstance.defaults.httpsAgent = agent;
      axiosInstance.defaults.httpAgent = agent;
    }

    const response = await axiosInstance({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 30000, // 30秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`[ImageGenerator] Image saved to: ${filePath}`);
    return filePath;
  }

  /**
   * 获取最近生成的图片列表
   */
  getRecentImages(limit = 10) {
    const files = fs.readdirSync(this.imageDir)
      .filter(f => f.startsWith('image_') && f.endsWith('.png'))
      .sort((a, b) => {
        const aTime = parseInt(a.match(/image_(\d+)/)[1]);
        const bTime = parseInt(b.match(/image_(\d+)/)[1]);
        return bTime - aTime; // 最新在前
      })
      .slice(0, limit);

    return files.map(f => ({
      filename: f,
      path: path.join(this.imageDir, f),
      timestamp: parseInt(f.match(/image_(\d+)/)[1]),
    }));
  }

  /**
   * 清理旧的图片文件（保留最近50张）
   */
  cleanupOldImages() {
    const files = fs.readdirSync(this.imageDir)
      .filter(f => f.startsWith('image_') && f.endsWith('.png'))
      .sort((a, b) => {
        const aTime = parseInt(a.match(/image_(\d+)/)[1]);
        const bTime = parseInt(b.match(/image_(\d+)/)[1]);
        return aTime - bTime; // 最旧在前
      });

    if (files.length > 50) {
      const toDelete = files.slice(0, files.length - 50);
      toDelete.forEach(f => {
        fs.unlinkSync(path.join(this.imageDir, f));
      });
      console.log(`[ImageGenerator] Cleaned up ${toDelete.length} old images`);
    }
  }
}

module.exports = new GrokImageGenerator();