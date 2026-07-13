import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'
import { SourceStateManager } from '@paperback/types/lib'

import {
    ApiChapter,
    ApiChapterDetailsResponse,
    ApiCollectionResponse,
    ApiGenre,
    ApiSeriesDetailResponse,
    ApiSeriesItem,
    ApiTrendingItem,
    StatusTypes
} from './AsuraScansInterfaces'

import entities = require('entities')

export const browseFilterStatuses = [
    { value: 'ongoing', label: 'Ongoing' },
    { value: 'completed', label: 'Completed' },
    { value: 'hiatus', label: 'Hiatus' },
    { value: 'dropped', label: 'Dropped' }
]

export const browseFilterTypes = [
    { value: 'manhwa', label: 'Manhwa' },
    { value: 'manhua', label: 'Manhua' },
    { value: 'manga', label: 'Mangatoon' }
]

export const browseFilterOrder = [
    { value: 'latest', label: 'Latest Update' },
    { value: 'popular', label: 'Popular' },
    { value: 'rating', label: 'Rating' },
    { value: 'title', label: 'A-Z' },
    { value: 'newest', label: 'Newest' }
]

interface FilterTagItem {
    id?: number | string
    value?: string
    name?: string
    label?: string
}

interface MangaParserContext {
    cheerio: {
        load(html: string, options: { _useHtmlParser2: boolean }): { text(): string }
    }
    fallbackImage: string
    manga_StatusTypes: StatusTypes
}

interface ChapterParserContext {
    language: string
    stateManager: SourceStateManager
}

export class AsuraScansParser {
    async parseMangaDetails(response: ApiSeriesDetailResponse, mangaId: string, source: MangaParserContext): Promise<SourceManga> {
        const comic = response.series
        if (!comic) {
            throw new Error(`Failed to parse manga details (missing series) for ${mangaId}`)
        }

        const titles: string[] = [comic.title.trim()]
        if (comic.alt_titles?.length) {
            for (const t of comic.alt_titles) {
                const x = t.trim()
                if (x && !titles.includes(x)) {
                    titles.push(x)
                }
            }
        }

        const $desc = source.cheerio.load(comic.description.trim(), { _useHtmlParser2: true })
        const description = this.decodeHTMLEntity(
            $desc.text().replace(/\r\n/gm, '\n')
        )

        const rawStatus = comic.status.trim().toLowerCase()
        let status: string
        switch (rawStatus) {
            case source.manga_StatusTypes.DROPPED.toLowerCase():
                status = 'Dropped'
                break
            case source.manga_StatusTypes.ONGOING.toLowerCase():
                status = 'Ongoing'
                break
            case source.manga_StatusTypes.COMPLETED.toLowerCase():
                status = 'Completed'
                break
            case source.manga_StatusTypes.HIATUS.toLowerCase():
                status = 'Hiatus'
                break
            case source.manga_StatusTypes.SEASONEND.toLowerCase():
                status = 'Season End'
                break
            case source.manga_StatusTypes.COMINGSOON.toLowerCase():
                status = 'Coming Soon'
                break
            default:
                status = 'Ongoing'
                break
        }

        const genres = Array.isArray(comic.genres) ? comic.genres : []
        const tags: Tag[] = genres.map((g) =>
            App.createTag({ id: `genres:${g.id}`, label: g.name })
        )

        const tagSections: TagSection[] = [
            App.createTagSection({
                id: '0',
                label: 'genres',
                tags
            })
        ]

        const author = comic.author?.trim() || 'Unknown'
        const artist = comic.artist?.trim() || 'Unknown'

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image: comic.cover || source.fallbackImage,
                covers: [comic.cover],
                status,
                author,
                artist,
                tags: tagSections,
                desc: description,
                rating: comic.rating
            })
        })
    }

    async parseChapterList(response: ApiCollectionResponse<ApiChapter>, mangaId: string, source: ChapterParserContext): Promise<Chapter[]> {
        const list = response.data
        if (!Array.isArray(list) || list.length === 0) {
            throw new Error(`Failed to parse chapter list (empty chapters) for manga ${mangaId}`)
        }

        if (!list[0]?.series_slug?.trim()) {
            throw new Error(`Could not resolve series slug for ${mangaId}`)
        }

        const chapters: Chapter[] = []
        let sortingIndex = 0
        for (const chapter of list) {
            const id = chapter.id?.toString()
            if (!id) {
                throw new Error(`Could not parse out ID when getting chapters for postId:${mangaId}`)
            }

            if (chapter.is_locked || chapter.is_premium) {
                continue
            }

            const title = chapter.title?.trim()
            const publishedDate = chapter.published_at
            await source.stateManager.store(`${mangaId}:${id}`, String(chapter.number))

            chapters.push({
                id,
                langCode: source.language,
                chapNum: chapter.number,
                name: title ? title : `Chapter ${chapter.number}`,
                time: new Date(publishedDate),
                sortingIndex,
                volume: 0,
                group: ''
            })
            sortingIndex--
        }

        return chapters.map((chapter) => {
            chapter.sortingIndex += chapters.length
            return App.createChapter(chapter)
        })
    }

    parseChapterDetails(response: ApiChapterDetailsResponse, mangaId: string, chapterId: string): ChapterDetails {
        const pageList = response.data?.chapter?.pages
        if (!Array.isArray(pageList) || pageList.length === 0) {
            throw new Error(`Failed to parse chapter pages (empty pages) for ${mangaId}/${chapterId}`)
        }

        const pages = pageList.map((p) => p.url).filter(Boolean)
        if (pages.length === 0) {
            throw new Error(`Failed to parse chapter pages (no URLs) for ${mangaId}/${chapterId}`)
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages
        })
    }

    parseTags(genres: ApiGenre[]): TagSection[] {

        // Predefined chapters tags
        const predefinedChaptersTags: Tag[] = [
            { id: 'chapters:10', label: '+10' },
            { id: 'chapters:20', label: '+20' },
            { id: 'chapters:30', label: '+30' },
            { id: 'chapters:40', label: '+40' },
            { id: 'chapters:50', label: '+50' },
            { id: 'chapters:60', label: '+60' },
            { id: 'chapters:70', label: '+70' },
            { id: 'chapters:80', label: '+80' },
            { id: 'chapters:90', label: '+90' },
            { id: 'chapters:100', label: '+100' },
            { id: 'chapters:150', label: '+150' },
            { id: 'chapters:200', label: '+200' },
            { id: 'chapters:250', label: '+250' }
        ]

        const createTags = (filterItems: FilterTagItem[], prefix: string): Tag[] => {
            return filterItems.map((item) => ({
                id: `${prefix}:${item.id ?? item.value}`,
                label: item.name ?? item.label ?? ''
            }))
        }

        const tagSections: TagSection[] = [
            // Tag section for genres
            App.createTagSection({
                id: '0',
                label: 'genres',
                tags: createTags(genres, 'genres').map(x => App.createTag(x))
            }),
            // Tag section for status
            App.createTagSection({
                id: '1',
                label: 'status',
                tags: createTags(browseFilterStatuses, 'status').map(x => App.createTag(x))
            }),
            // Tag section for types
            App.createTagSection({
                id: '2',
                label: 'type',
                tags: createTags(browseFilterTypes, 'type').map(x => App.createTag(x))
            }),
            // Tag section for order
            App.createTagSection({
                id: '3',
                label: 'order',
                tags: createTags(browseFilterOrder, 'order').map(x => App.createTag(x))
            }),
            // Predefined chapters tag section
            App.createTagSection({
                id: '4',
                label: 'chapters',
                tags: predefinedChaptersTags.map(x => App.createTag(x))
            })
        ]
        return tagSections
    }

    parseSeriesItems(items: ApiSeriesItem[], fallbackImage: string): PartialSourceManga[] {
        return items.map((item) => {
            const latestChapter = item.latest_chapters?.[0]
            const subtitle = latestChapter
                ? `Chapter ${latestChapter.number}${latestChapter.is_premium ? ' 🔒' : ''}`
                : ''
            return App.createPartialSourceManga({
                mangaId: item.slug,
                image: item.cover || fallbackImage,
                title: this.decodeHTMLEntity(item.title),
                subtitle
            })
        })
    }

    parseTrendingItems(items: ApiTrendingItem[], fallbackImage: string): PartialSourceManga[] {
        return items.map((item) => {
            const subtitle = item.latest_chapter_number != null
                ? `Chapter ${item.latest_chapter_number}`
                : ''
            return App.createPartialSourceManga({
                mangaId: item.slug,
                image: item.cover_url || fallbackImage,
                title: this.decodeHTMLEntity(item.title),
                subtitle
            })
        })
    }

    protected decodeHTMLEntity(str: string): string {
        if (!str) {
            return ''
        }
        return entities.decodeHTML(str)
    }
}
