export interface StatusTypes {
    ONGOING: string
    HIATUS: string
    COMPLETED: string
    DROPPED: string
    SEASONEND: string
    COMINGSOON: string
}

export interface PageMetadata {
    page: number
}

export interface ApiPaginationMeta {
    total?: number
    per_page?: number
    has_more?: boolean
}

export interface ApiCollectionResponse<T> {
    data: T[]
    meta?: ApiPaginationMeta
}

export interface ApiGenre {
    id: number
    name: string
    slug: string
}

export interface ApiLatestChapter {
    id: number
    number: number
    slug: string
    is_premium?: boolean
}

export interface ApiSeriesItem {
    id: number
    slug: string
    title: string
    cover: string
    latest_chapters?: ApiLatestChapter[]
}

export interface ApiTrendingItem {
    id: number
    slug: string
    title: string
    cover_url: string
    latest_chapter_number?: number
}

export interface ApiSeriesDetail {
    id: number
    slug: string
    title: string
    alt_titles?: string[]
    description: string
    cover: string
    status: string
    author?: string
    artist?: string
    rating: number
    genres: ApiGenre[]
}

export interface ApiSeriesDetailResponse {
    series?: ApiSeriesDetail
}

export interface ApiChapter {
    id: number
    slug: string
    number: number
    title?: string
    published_at: string
    series_slug: string
    is_locked: boolean
    is_premium: boolean
}

export interface ApiChapterPage {
    url: string
}

export interface ApiChapterDetailsResponse {
    data?: {
        chapter?: {
            pages?: ApiChapterPage[]
        }
    }
}

export type TrendingPeriod = 'trending' | 'week' | 'month' | 'all'

export interface SeriesQueryOptions {
    limit: number
    offset: number
    search?: string
    genres?: string[]
    status?: string
    type?: string
    sort?: string
    order?: 'asc' | 'desc'
    minChapters?: string
}

interface HomeSectionDefinitionBase {
    id: string
    title: string
    type: string
    containsMoreItems: boolean
}

export type HomeSectionDefinition = HomeSectionDefinitionBase & (
    | { kind: 'latest' }
    | { kind: 'trending'; period: TrendingPeriod }
)
