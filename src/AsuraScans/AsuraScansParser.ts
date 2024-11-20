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
import {
    Filters
} from './AsuraScansInterfaces'
import { NextJSParser } from './NextJSParser'

export class DevAsuraScansParser {
    async parseMangaDetails(data: string, mangaId: string, source: any): Promise<SourceManga> {
        const $ = source.cheerio.load(data, { _useHtmlParser2: true })
        const nextJSParser = new NextJSParser($)
        const comicKey = nextJSParser.getReferenceKeyForProperty('comic')
        if (!comicKey) {
            throw new Error(`Failed to retrieve the comic key for manga ${mangaId}`)
        }
        const comic = nextJSParser.getObjectByKey(comicKey)

        const titles: string[] = []
        titles.push(comic.name.trim())

        const author = comic.author?.trim()
        const artist = comic.artist?.trim()
        const image = comic.thumb
        const covers = [comic.cover]
        let description = comic.summary.trim()
        if (description != '') {
            description = this.decodeHTMLEntity(source.cheerio.load(description).text().replace(/\\r\\n/gm, '\n'))
        }
        const rating = comic.rating

        const slug = comic.slug?.trim()
        if (slug) {
            await source.setMangaSlug(mangaId, `series/${slug}`)
        }

        const rawStatus = comic.status?.name?.trim() ?? ''
        let status
        switch (rawStatus.toLowerCase()) {
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

        const tagSections: TagSection[] = [
            App.createTagSection({
                id: '0',
                label: 'genres',
                tags: comic.genres.map((tag: any) => App.createTag({ id: `genres:${tag.id.toString()}`, label: tag.name }))
            })
        ]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image: image || source.fallbackImage,
                covers: covers,
                status,
                author: author == '' ? 'Unknown' : author,
                artist: artist == '' ? 'Unknown' : artist,
                tags: tagSections,
                desc: description,
                rating: rating
            })
        })
    }

    async parseChapterList(data: string, mangaId: string, source: any): Promise<Chapter[]> {
        const $ = source.cheerio.load(data, { _useHtmlParser2: true })
        const nextJSParser = new NextJSParser($, ["chapters", "comic"])
        const chapterKey = nextJSParser.getKeyForProperty('chapters')
        if (!chapterKey) {
            throw new Error(`Failed to retrieve the chapter key for manga ${mangaId}`)
        }

        const comicKey = nextJSParser.getKeyForProperty('comic')
        if (!comicKey) {
            throw new Error(`Failed to retrieve the comic key for manga ${mangaId}`)
        }

        const comic = nextJSParser.getObjectByKey(comicKey)
        const rawChapters = nextJSParser.getObjectByKey(chapterKey)

        const slug = comic.slug?.trim()
        let mangaUrl = ''
        if (slug) {
            mangaUrl = `series/${slug}`
            await source.setMangaSlug(mangaId, mangaUrl)
        }

        if (!mangaUrl) {
            mangaUrl = await source.getMangaSlug(mangaId)
        }

        const chapters: Chapter[] = []
        let sortingIndex = 0
        for (const chapter of rawChapters[3].chapters.reverse()) {
            const id = chapter.id.toString()
            if (!id || typeof id === 'undefined') {
                throw new Error(`Could not parse out ID when getting chapters for postId:${mangaId}`)
            }

            const title = chapter.title
            const name = chapter.name
            const publishedDate = chapter.published_at
            const link = `${mangaUrl}/chapter/${name}`

            await source.stateManager.store(`${mangaId}:${id}`, link)

            chapters.push({
                id,
                langCode: source.language,
                chapNum: name,
                name: !title ? `Chapter ${name}` : title,
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
        const nextJSParser = new NextJSParser($)
        const key = nextJSParser.getReferenceKeyForProperty('pages')
        if (!key) {
            throw new Error(`Failed to parse chapter pages for manga ${mangaId}`)
        }

        const pagesObj = nextJSParser.getObjectByKey(key)

        const pages = pagesObj
            .sort((x: any) => x.order)
            .map((x: any) => x.url)

        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages: pages
        })
    }

    parseTags(filters: Filters): TagSection[] {

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
            return filterItems.map((item: { id: any; value: any; name: any }) => ({
                id: `${prefix}:${item.id ?? item.value}`, // Use `id` or `value` for `order` items
                label: item.name
            }))
        }

        const tagSections: TagSection[] = [
            // Tag section for genres
            App.createTagSection({
                id: '0',
                label: 'genres',
                tags: createTags(filters.genres, 'genres').map(x => App.createTag(x))
            }),
            // Tag section for status
            App.createTagSection({
                id: '1',
                label: 'status',
                tags: createTags(filters.statuses, 'status').map(x => App.createTag(x))
            }),
            // Tag section for types
            App.createTagSection({
                id: '2',
                label: 'type',
                tags: createTags(filters.types, 'type').map(x => App.createTag(x))
            }),
            // Tag section for order
            App.createTagSection({
                id: '3',
                label: 'order',
                tags: createTags(filters.order.map(order => ({ id: order.value, name: order.name })), 'order').map(x => App.createTag(x))
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

    async parseSearchResults($: CheerioSelector, source: any): Promise<any[]> {
        const results: any[] = []

        const mangas = $('a', $('h3:contains(Series list)')?.parent()?.next()?.next())
        if (!mangas.length) {
            console.log('Unable to parse search results!')
            return results
        }

        for (const manga of mangas.toArray()) {
            const slug = $(manga).attr('href') ?? ''

            if (!slug) {
                throw new Error(`Unable to parse slug (${slug})!`)
            }

            const image = this.getImageSrc($('img', manga))
            const title = $('span.block', manga).text().trim()
            const subtitle = $('span.block', manga)?.next()?.text().trim() ?? ''
            const mangaId: string = this.idCleaner(slug ?? '')

            await source.setMangaSlug(mangaId, slug)

            results.push({
                mangaId,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            })
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

    isLastPage = ($: CheerioStatic, id: string): boolean => {
        let isLast = true
        const obj = $('a:contains(Next)')
        const hasNext = obj.attr('style')?.includes('pointer-events:auto') ?? false
        if (hasNext) {
            isLast = false
        }

        return isLast
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