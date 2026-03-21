import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'

import {
    HomeSectionData
} from './AsuraScansHelper'

import entities = require('entities')
import { parseAstroIsland } from './AstroIslandProps'

export const browseFilterStatuses = [
    { value: 'all', label: 'All' },
    { value: 'ongoing', label: 'Ongoing' },
    { value: 'completed', label: 'Completed' },
    { value: 'hiatus', label: 'Hiatus' },
    { value: 'dropped', label: 'Dropped' }
]

export const browseFilterTypes = [
    { value: 'all', label: 'All' },
    { value: 'manhwa', label: 'Manhwa' },
    { value: 'manhua', label: 'Manhua' },
    { value: 'manga', label: 'Mangatoon' }
]

export const browseFilterOrder = [
    { value: 'update', label: 'Latest Update' },
    { value: 'popular', label: 'Popular' },
    { value: 'rating', label: 'Rating' },
    { value: 'name', label: 'A-Z' },
    { value: 'newest', label: 'Newest' }
]

/** Shape of DescriptionModal props after `AstroIslandProps.astroUnwrap`. */
interface AstroMangaDetailsProps {
    title: string
    description: string
    alternativeTitles: string
    coverUrl: string
    rating: number
    status: string
    author: string
    artist: string
    genres: { id: number; name: string; slug: string }[]
}

/** Chapter list island (prefix r19) after `AstroIslandProps.astroUnwrap`. */
interface AstroChapterListProps {
    chapters: {
        id: number
        slug: string
        number: number
        title?: string
        published_at: string
        series_slug: string
    }[]
    publicUrl?: string
    seriesSlug?: string
}

/** Chapter reader island (prefix r1) after `AstroIslandProps.astroUnwrap`. */
interface AstroChapterReaderProps {
    pages: { url: string; width?: number; height?: number }[]
    chapterId?: number
}

export class AsuraScansParser {
    async parseMangaDetails(data: string, mangaId: string, source: any): Promise<SourceManga> {
        const $ = source.cheerio.load(data, { _useHtmlParser2: true })
        const comic = parseAstroIsland<AstroMangaDetailsProps>(
            $,
            'r16',
            `parse manga details for ${mangaId}`
        )

        const titles: string[] = [
            comic.title.trim()
        ]

        const description = this.decodeHTMLEntity(
            $.load(comic.description.trim()).text().replace(/\\r\\n/gm, '\n')
        )

        try {
            const p = $('link[rel=canonical]').attr('href')
            const path = p ? new URL(p).pathname : ''
            const pathSegments = path.split('/').filter((s) => s !== '')
            const slug = pathSegments.length === 0 ? '' : pathSegments[pathSegments.length - 1]!
            if (slug) await source.setMangaSlug(mangaId, slug)
        } catch { /* invalid URL */ }

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

        const tags: Tag[] = comic.genres.map((g) =>
            App.createTag({ id: `genres:${g.id}`, label: g.name })
        )

        const tagSections: TagSection[] = [
            App.createTagSection({
                id: '0',
                label: 'genres',
                tags
            })
        ]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image: comic.coverUrl || source.fallbackImage,
                covers: [comic.coverUrl],
                status,
                author: comic.author ? comic.author.trim() : 'Unknown',
                 artist: comic.artist ? comic.artist.trim() : 'Unknown',
                tags: tagSections,
                desc: description,
                rating: comic.rating
            })
        })
    }

    async parseChapterList(data: string, mangaId: string, source: any): Promise<Chapter[]> {
        const $ = source.cheerio.load(data, { _useHtmlParser2: true })
        const props = parseAstroIsland<AstroChapterListProps>(
            $,
            'r19',
            `parse chapter list for manga ${mangaId}`
        )
        const list = props.chapters
        if (!Array.isArray(list) || list.length === 0) {
            throw new Error(`Failed to parse chapter list (empty chapters) for manga ${mangaId}`)
        }

        const publicPath = (props.publicUrl ?? '')
            .replace(/^\/+/, '')
            .trim()
        const seriesSlug = (props.seriesSlug ?? '').trim()

        let mangaUrl = ''
        if (publicPath && !publicPath.includes('/chapter/')) {
            mangaUrl = publicPath
            await source.setMangaSlug(mangaId, mangaUrl)
        } else if (seriesSlug) {
            mangaUrl = `comics/${seriesSlug}`
            await source.setMangaSlug(mangaId, mangaUrl)
        }

        if (!mangaUrl) {
            mangaUrl = await source.getMangaSlug(mangaId)
        }

        const chapters: Chapter[] = []
        let sortingIndex = 0
        for (const chapter of list) {
            const id = chapter.id?.toString()
            if (!id) {
                throw new Error(`Could not parse out ID when getting chapters for postId:${mangaId}`)
            }

            const slug = chapter.slug?.trim()
            if (!slug) {
                throw new Error(`Could not parse chapter slug for manga ${mangaId} chapter ${id}`)
            }

            const title = chapter.title?.trim()
            const publishedDate = chapter.published_at
            const link = `${mangaUrl}/chapter/${slug}`

            await source.stateManager.store(`${mangaId}:${id}`, link)

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

    parseChapterDetails($: CheerioStatic, mangaId: string, chapterId: string): ChapterDetails {
        const props = parseAstroIsland<AstroChapterReaderProps>(
            $,
            'r1',
            `parse chapter pages for ${mangaId}/${chapterId}`
        )
        const pageList = props.pages
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

    parseTags(genres: any[]): TagSection[] {

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

        const createTags = (filterItems: any, prefix: string): Tag[] => {
            return filterItems.map((item: { id: any; value: any; name: any; label: any }) => ({
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

    async parseSearchResults($: CheerioSelector, source: any): Promise<PartialSourceManga[]> {
        const results: PartialSourceManga[] = []

        const cards = $('div.series-card')
        if (!cards.length) {
            console.log('Unable to parse search results!')
            return results
        }

        for (const card of cards.toArray()) {
            const $card = $(card)
            const linkEl = $('a', $card)
            const slug = linkEl.attr('href') ?? ''
            if (!slug) {
                continue
            }

            const image = this.getImageSrc($('img', $card))
            const title = $card.find('h3').first().text().trim()
            const subtitle = $card.find('.text-xs').first().text()
                .replace(/\s*Chapters\s*/gi, '')
                .replace(/\s+/g, ' ')
                .trim()
            const mangaId: string = this.idCleaner(slug)

            await source.setMangaSlug(mangaId, slug)

            results.push(App.createPartialSourceManga({
                mangaId,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            }))
        }

        return results
    }

    async parseViewMore($: CheerioStatic, source: any): Promise<PartialSourceManga[]> {
        const items: PartialSourceManga[] = []

        for (const manga of $('div.bs', 'div.listupd').toArray()) {
            const title = $('a', manga).attr('title')
            const image = this.getImageSrc($('img', manga))
            const subtitle = $('div.epxs', manga).text().trim()

            const slug: string = this.idCleaner($('a', manga).attr('href') ?? '')
            const path: string = ($('a', manga).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
            const postId = $('a', manga).attr('rel')
            const mangaId: string = source.usePostIds
                ? (isNaN(Number(postId))
                    ? await source.slugToPostId(slug, path)
                    : postId)
                : slug

            if (!mangaId || !title) {
                console.log(`Failed to parse homepage sections for ${source.baseUrl}`)
                continue
            }

            items.push(App.createPartialSourceManga({
                mangaId,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            }))
        }

        return items
    }

    async parseHomeSection($: CheerioStatic, section: HomeSectionData, source: any): Promise<PartialSourceManga[]> {
        const items: PartialSourceManga[] = []

        const mangas = section.selectorFunc($)
        if (!mangas.length) {
            console.log(`Unable to parse valid ${section.section.title} section!`)
            return items
        }

        for (const manga of mangas.toArray()) {
            const title = section.titleSelectorFunc($, manga)
            if (!title) {
                console.log(`Failed to parse homepage sections for ${source.baseUrl} title (${title})`)
                continue
            }
            const image = this.getImageSrc($('img', manga))
            const subtitle = section.subtitleSelectorFunc($, manga) ?? ''
            const href = $('a', manga).attr('href') ?? ''
            const mangaId: string = this.idCleaner(href ?? '')

            if (!mangaId) {
                console.log(`Failed to parse homepage sections for ${source.baseUrl} title (${title}) mangaId (${mangaId})`)
                continue
            }

            await source.setMangaSlug(mangaId, href)

            items.push(App.createPartialSourceManga({
                mangaId,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            }))
        }

        return items
    }

    isLastPage = ($: CheerioStatic, _id: string): boolean => {
        const nextPage = $('a[aria-label="Next page"]').first()
        if (nextPage.length) {
            const cls = nextPage.attr('class') ?? ''
            const hasHref = !!nextPage.attr('href')
            const disabled = cls.includes('pointer-events-none')
            return !hasHref || disabled
        }

        const obj = $('a:contains(Next)')
        const hasNext = obj.attr('style')?.includes('pointer-events:auto') ?? false
        return !hasNext
    }

    protected getImageSrc(imageObj: Cheerio | undefined): string {
        let image: string | undefined
        const src = imageObj?.attr('src')
        const dataLazy = imageObj?.attr('data-lazy-src')
        const srcset = imageObj?.attr('srcset')
        const dataSRC = imageObj?.attr('data-src')

        if (typeof src != 'undefined' && !src?.startsWith('data')) {
            image = src
        } else if (typeof dataLazy != 'undefined' && !dataLazy?.startsWith('data')) {
            image = dataLazy
        } else if (typeof srcset != 'undefined' && !srcset?.startsWith('data')) {
            image = srcset?.split(' ')[0] ?? ''
        } else if (typeof dataSRC != 'undefined' && !dataSRC?.startsWith('data')) {
            image = dataSRC
        } else {
            image = 'https://i.imgur.com/GYUxEX8.png'
        }

        image = image?.split('?resize')[0] ?? ''

        return decodeURI(this.decodeHTMLEntity(image?.trim() ?? ''))
    }

    protected decodeHTMLEntity(str: string): string {
        if (!str) {
            return ''
        }
        return entities.decodeHTML(str)
    }

    protected idCleaner(str: string): string {
        let cleanId: string | null = str
        cleanId = cleanId.replace(/\/$/, '')
        cleanId = cleanId.split('/').pop() ?? null
        // Remove randomised slug part
        cleanId = cleanId?.substring(0, cleanId?.lastIndexOf('-')) ?? null

        if (!cleanId) {
            throw new Error(`Unable to parse id for ${str}`)
        }

        return cleanId
    }
}