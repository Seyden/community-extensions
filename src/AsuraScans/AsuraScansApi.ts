import {
    RequestManager,
    Response
} from '@paperback/types'

import {
    ApiChapter,
    ApiChapterDetailsResponse,
    ApiCollectionResponse,
    ApiGenre,
    ApiSeriesDetailResponse,
    ApiSeriesItem,
    ApiTrendingItem,
    SeriesQueryOptions,
    TrendingPeriod
} from './AsuraScansInterfaces'
import { URLBuilder } from './UrlBuilder'

const API_DOMAIN = 'https://api.asurascans.com'

export class AsuraScansApi {
    constructor(
        private readonly requestManager: RequestManager,
        private readonly websiteBaseUrl: string
    ) { }

    async getSeries(mangaId: string): Promise<ApiSeriesDetailResponse> {
        return this.loadJsonData<ApiSeriesDetailResponse>(
            this.buildUrl(['api', 'series', mangaId])
        )
    }

    async getChapters(mangaId: string): Promise<ApiCollectionResponse<ApiChapter>> {
        return this.loadCollection<ApiChapter>(
            this.buildUrl(['api', 'series', mangaId, 'chapters'])
        )
    }

    async getChapterDetails(mangaId: string, chapter: string): Promise<ApiChapterDetailsResponse> {
        return this.loadJsonData<ApiChapterDetailsResponse>(
            this.buildUrl(['api', 'series', mangaId, 'chapters', encodeURIComponent(chapter)])
        )
    }

    async getGenres(): Promise<ApiCollectionResponse<ApiGenre>> {
        return this.loadCollection<ApiGenre>(this.buildUrl(['api', 'genres']))
    }

    async getSeriesPage(options: SeriesQueryOptions): Promise<ApiCollectionResponse<ApiSeriesItem>> {
        const url = new URLBuilder(API_DOMAIN)
            .addPathComponent('api')
            .addPathComponent('series')
            .addQueryParameter('limit', options.limit.toString())
            .addQueryParameter('offset', options.offset.toString())
            .addQueryParameter('search', options.search ? encodeURIComponent(options.search) : undefined)
            .addQueryParameter('genres', options.genres)
            .addQueryParameter('status', options.status)
            .addQueryParameter('type', options.type)
            .addQueryParameter('sort', options.sort)
            .addQueryParameter('order', options.order)
            .addQueryParameter('min_chapters', options.minChapters)
            .buildUrl()

        return this.loadCollection<ApiSeriesItem>(url)
    }

    async getTrending(period: TrendingPeriod, limit = 10): Promise<ApiCollectionResponse<ApiTrendingItem>> {
        const url = new URLBuilder(API_DOMAIN)
            .addPathComponent('api')
            .addPathComponent('trending')
            .addPathComponent(period)
            .addQueryParameter('limit', limit.toString())
            .buildUrl()

        return this.loadCollection<ApiTrendingItem>(url)
    }

    async loadJsonData<T>(url: string, method = 'GET'): Promise<T> {
        const request = App.createRequest({ url, method })
        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseErrors(response)

        const responseData: unknown = response.data
        if (responseData == null) {
            throw new Error(`Empty JSON response from ${url}`)
        }

        if (typeof responseData !== 'string') {
            return responseData as T
        }

        try {
            return JSON.parse(responseData) as T
        } catch {
            throw new Error(`Failed to parse JSON response from ${url}`)
        }
    }

    private async loadCollection<T>(url: string): Promise<ApiCollectionResponse<T>> {
        const response = await this.loadJsonData<ApiCollectionResponse<T>>(url)
        if (!Array.isArray(response.data)) {
            throw new Error(`Missing data array in JSON response from ${url}`)
        }
        return response
    }

    private buildUrl(pathComponents: string[]): string {
        const builder = new URLBuilder(API_DOMAIN)
        for (const component of pathComponents) {
            builder.addPathComponent(component)
        }
        return builder.buildUrl()
    }

    private checkResponseErrors(response: Response): void {
        switch (response.status) {
            case 403:
            case 503:
                throw new Error(`CLOUDFLARE BYPASS ERROR:\\nPlease go to the homepage of <${this.websiteBaseUrl}> and press the cloud icon.`)
            case 404:
                throw new Error(`The requested page ${response.request.url} was not found!`)
            default:
                if (response.status < 200 || response.status >= 300) {
                    throw new Error(`Request to ${response.request.url} failed with status ${response.status}`)
                }
        }
    }
}
