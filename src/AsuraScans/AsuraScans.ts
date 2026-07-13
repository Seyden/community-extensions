/* eslint-disable linebreak-style */
import {
    Chapter,
    ChapterDetails,
    ChapterProviding,
    ContentRating,
    HomePageSectionsProviding,
    HomeSection,
    HomeSectionType,
    MangaProviding,
    PagedResults,
    PartialSourceManga,
    Request,
    Response,
    SearchRequest,
    SearchResultsProviding,
    SourceInfo,
    SourceIntents,
    SourceManga,
    TagSection
} from '@paperback/types'

import { parse } from 'url'

import { AsuraScansApi } from './AsuraScansApi'
import { AsuraScansParser } from './AsuraScansParser'
import {
    getFilterTagsBySection,
    getIncludedTagBySection,
    isImgLink
} from './AsuraScansHelper'

import {
    ApiPaginationMeta,
    HomeSectionDefinition,
    PageMetadata,
    SeriesQueryOptions,
    StatusTypes
} from './AsuraScansInterfaces'

import {
    DUINavigationButton,
    DUISection,
    SourceStateManager
} from '@paperback/types/lib'

const ASURASCANS_DOMAIN = 'https://asurascans.com'
const SERIES_PAGE_LIMIT = 20
const HOME_SECTION_DEFINITIONS: HomeSectionDefinition[] = [
    {
        id: 'trending',
        title: 'Trending',
        type: HomeSectionType.singleRowLarge,
        containsMoreItems: false,
        kind: 'trending',
        period: 'trending'
    },
    {
        id: 'latest_updates',
        title: 'Latest Updates',
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: true,
        kind: 'latest'
    },
    {
        id: 'weekly',
        title: 'Weekly',
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: false,
        kind: 'trending',
        period: 'week'
    },
    {
        id: 'monthly',
        title: 'Monthly',
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: false,
        kind: 'trending',
        period: 'month'
    },
    {
        id: 'all_time',
        title: 'All Time',
        type: HomeSectionType.singleRowNormal,
        containsMoreItems: false,
        kind: 'trending',
        period: 'all'
    }
]

export const AsuraScansInfo: SourceInfo = {
    version: '6.0.5',
    name: 'AsuraScans',
    description: 'Extension that pulls manga from AsuraScans',
    author: 'Seyden',
    authorWebsite: 'https://github.com/Seyden',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: ASURASCANS_DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: []
}

export class AsuraScans implements ChapterProviding, HomePageSectionsProviding, MangaProviding, SearchResultsProviding {

    constructor(public cheerio: CheerioAPI) { }

    stateManager = App.createSourceStateManager()

    async getSourceMenu(): Promise<DUISection> {
        return App.createDUISection({
            id: 'sourceMenu',
            header: 'Source Menu',
            isHidden: false,
            rows: async () => [
                this.sourceSettings(this.stateManager)
            ]
        })
    }

    sourceSettings = (stateManager: SourceStateManager): DUINavigationButton => App.createDUINavigationButton({
        id: 'asurascans_settings',
        label: 'Source Settings',
        form: App.createDUIForm({
            sections: async () => [
                App.createDUISection({
                    id: 'domain',
                    isHidden: false,
                    footer: 'Override the domain url for the source.',
                    rows: async () => [
                        App.createDUIInputField({
                            id: 'domain_url',
                            label: 'Domain',
                            value: App.createDUIBinding({
                                get: async () => await this.getBaseUrl(),
                                set: async (newValue) => await stateManager.store('Domain', newValue)
                            })
                        })
                    ]
                })
            ]
        })
    })

    parser = new AsuraScansParser()

    // ----REQUEST MANAGER----
    requestManager = App.createRequestManager({
        requestsPerSecond: 15,
        requestTimeout: 30000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const url: string = await this.getBaseUrl()
                request.headers = {
                    ...(request.headers ?? {}), ...{
                        'user-agent': await this.requestManager.getDefaultUserAgent(),
                        referer: `${url}/`
                    }
                }

                const urlObject = parse(request.url)

                if (!urlObject.protocol || urlObject.protocol === 'http:') {
                    urlObject.protocol = 'https:'
                    request.url = urlObject.toString()
                }


                if (urlObject.hostname?.includes('localhost')) {
                    const baseUrl = await this.getBaseUrl()
                    const baseHost = parse(baseUrl).host ?? ''
                    urlObject.host = baseHost
                    request.url = urlObject.toString()
                }


                if (isImgLink(request.url)) {
                    const overrideUrl: string = await this.stateManager.retrieve('Domain')

                    if (overrideUrl && overrideUrl !== this.baseUrl) {
                        const basePath = parse(this.baseUrl)
                        const overridePath = parse(overrideUrl)

                        if (urlObject.host?.includes(basePath.host ?? '') || urlObject.host?.includes(overridePath.host ?? '')) {
                            urlObject.host = overridePath.host
                            request.url = urlObject.toString()
                        }
                    }
                }

                return request
            },

            interceptResponse: async (response: Response): Promise<Response> => {
                if (response.headers.location) {
                    response.headers.location = response.headers.location.replace(/^http:/, 'https:')
                }
                return response
            }
        }
    })

    api = new AsuraScansApi(this.requestManager, ASURASCANS_DOMAIN)

    /**
     * The URL of the website. Eg. https://mangadark.com without a trailing slash
     */
    baseUrl: string = ASURASCANS_DOMAIN
    async getBaseUrl(): Promise<string> {
        const settingsUrl = await this.stateManager.retrieve('Domain')
        const url: string = settingsUrl ? settingsUrl : this.baseUrl
        return url.replace(/\/*$/, '')
    }

    /**
     * The language code which this source supports.
     */
    language = '🇬🇧'

    /**
     * Fallback image if no image is present
     * Default = "https://i.imgur.com/GYUxEX8.png"
     */
    fallbackImage = 'https://i.imgur.com/GYUxEX8.png'

    // ----MANGA DETAILS SELECTORS----

    manga_StatusTypes: StatusTypes = {
        COMINGSOON: 'COMING SOON',
        HIATUS: 'HIATUS',
        SEASONEND: 'SEASON END',
        ONGOING: 'ONGOING',
        COMPLETED: 'COMPLETED',
        DROPPED: 'DROPPED'
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const response = await this.api.getSeries(mangaId)
        return this.parser.parseMangaDetails(response, mangaId, this)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const response = await this.api.getChapters(mangaId)
        const chapters = await this.parser.parseChapterList(response, mangaId, this)
        if (!Array.isArray(chapters) || chapters.length == 0) {
            throw new Error(`Couldn't find any chapters for mangaId ${mangaId}, throwing an error to prevent loosing reading progress`)
        }

        return chapters
    }

    async getChapterSlug(mangaId: string, chapterId: string): Promise<string> {
        const chapterKey = `${mangaId}:${chapterId}`
        let existingMappedChapterLink = await this.stateManager.retrieve(chapterKey)
        if (existingMappedChapterLink == null) {
            await this.getChapters(mangaId)
            existingMappedChapterLink = await this.stateManager.retrieve(chapterKey)
        }

        if (existingMappedChapterLink != null && !/^\d+(\.\d+)?$/.test(existingMappedChapterLink.trim())) {
            await this.getChapters(mangaId)
            existingMappedChapterLink = await this.stateManager.retrieve(chapterKey)
        }

        if (existingMappedChapterLink == null || !/^\d+(\.\d+)?$/.test(existingMappedChapterLink.trim())) {
            throw new Error(`Could not parse out Chapter Link when getting chapter details for postId: ${mangaId} chapterId: ${chapterId}`)
        }

        return existingMappedChapterLink.trim()
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const chapterLink = await this.getChapterSlug(mangaId, chapterId)
        const response = await this.api.getChapterDetails(mangaId, chapterLink)
        return this.parser.parseChapterDetails(response, mangaId, chapterId)
    }

    async getSearchTags(): Promise<TagSection[]> {
        const response = await this.api.getGenres()
        return this.parser.parseTags(response.data)
    }

    async getSearchResults(query: SearchRequest, metadata: PageMetadata | undefined): Promise<PagedResults> {
        let result: {
            metadata: PageMetadata | undefined
            manga: PartialSourceManga[]
        }
        let manga: PartialSourceManga[] = []

        while (manga.length == 0) {
            result = await this.search(metadata, query)
            metadata = result.metadata
            manga = result.manga

            if (metadata == undefined) {
                break
            }
        }

        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    private async search(metadata: PageMetadata | undefined, query: SearchRequest) {
        const page: number = metadata?.page ?? 1
        const offset = (page - 1) * SERIES_PAGE_LIMIT
        const response = await this.api.getSeriesPage(this.createSeriesQuery(page, query))
        const results = this.parser.parseSeriesItems(response.data, this.fallbackImage)
        metadata = this.getNextPageMetadata(page, offset, SERIES_PAGE_LIMIT, response.data.length, response.meta)

        return {
            metadata,
            manga: results
        }
    }

    private createSeriesQuery(page: number, query: SearchRequest): SeriesQueryOptions {
        const offset = (page - 1) * SERIES_PAGE_LIMIT
        const sort = getIncludedTagBySection('order', query?.includedTags)

        return {
            limit: SERIES_PAGE_LIMIT,
            offset,
            search: query.title?.replace(/[’‘´`'-][a-z]*/g, '%'),
            genres: getFilterTagsBySection('genres', query?.includedTags),
            status: getIncludedTagBySection('status', query?.includedTags),
            type: getIncludedTagBySection('type', query?.includedTags),
            sort: sort || 'latest',
            order: 'desc',
            minChapters: getIncludedTagBySection('chapters', query?.includedTags)
        }
    }

    async supportsTagExclusion(): Promise<boolean> {
        return false
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = HOME_SECTION_DEFINITIONS.map((definition) => ({
            definition,
            section: App.createHomeSection({
                id: definition.id,
                title: definition.title,
                type: definition.type,
                containsMoreItems: definition.containsMoreItems
            })
        }))

        for (const { section } of sections) {
            sectionCallback(section)
        }

        await Promise.all(sections.map(async ({ definition, section }) => {
            section.items = await this.loadHomeSectionItems(definition)
            sectionCallback(section)
        }))
    }

    async getViewMoreItems(homepageSectionId: string, metadata: PageMetadata | undefined): Promise<PagedResults> {
        if (homepageSectionId !== 'latest_updates') {
            throw new Error(`Invalid homeSectionId | ${homepageSectionId}`)
        }

        const page: number = metadata?.page ?? 1
        const { offset, response } = await this.loadLatestUpdatesPage(page)

        return App.createPagedResults({
            results: this.parser.parseSeriesItems(response.data, this.fallbackImage),
            metadata: this.getNextPageMetadata(
                page,
                offset,
                SERIES_PAGE_LIMIT,
                response.data.length,
                response.meta
            )
        })
    }

    private async loadHomeSectionItems(definition: HomeSectionDefinition): Promise<PartialSourceManga[]> {
        switch (definition.kind) {
            case 'latest': {
                const { response } = await this.loadLatestUpdatesPage(1)
                return this.parser.parseSeriesItems(response.data, this.fallbackImage)
            }
            case 'trending': {
                const response = await this.api.getTrending(definition.period)
                return this.parser.parseTrendingItems(response.data, this.fallbackImage)
            }
        }
    }

    private async loadLatestUpdatesPage(page: number) {
        const offset = (page - 1) * SERIES_PAGE_LIMIT
        const response = await this.api.getSeriesPage({
            limit: SERIES_PAGE_LIMIT,
            offset,
            sort: 'latest',
            order: 'desc'
        })

        return { offset, response }
    }

    private getNextPageMetadata(
        page: number,
        offset: number,
        limit: number,
        itemCount: number,
        meta: ApiPaginationMeta | undefined
    ): PageMetadata | undefined {
        let hasMore: boolean
        if (typeof meta?.has_more === 'boolean') {
            hasMore = meta.has_more
        } else if (typeof meta?.total === 'number') {
            hasMore = offset + itemCount < meta.total
        } else {
            hasMore = itemCount >= limit
        }

        return hasMore ? { page: page + 1 } : undefined
    }

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        const url: string = await this.getBaseUrl()
        return App.createRequest({
            url: `${url}/`,
            method: 'GET',
            headers: {
                'referer': `${url}/`,
                'origin': `${url}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

}
