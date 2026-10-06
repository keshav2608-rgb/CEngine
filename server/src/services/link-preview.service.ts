import ogs from 'open-graph-scraper';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export class LinkPreviewService {
  /**
   * Fetch OpenGraph link preview metadata
   */
  static async getPreview(targetUrl: string): Promise<LinkPreviewData | null> {
    try {
      const { result } = await ogs({
        url: targetUrl,
        timeout: 4000,
      });

      if (!result.success) {
        return null;
      }

      return {
        url: targetUrl,
        title: result.ogTitle || result.twitterTitle,
        description: result.ogDescription || result.twitterDescription,
        image: result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url,
        siteName: result.ogSiteName,
      };
    } catch {
      return null;
    }
  }
}
