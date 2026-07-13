import {
    Tag
} from '@paperback/types'

export function getIncludedTagBySection(section: string, tags: Tag[] | undefined): string {
    return (tags?.find((x: Tag) => x.id.startsWith(`${section}:`))?.id.replace(`${section}:`, '') ?? '').replace(' ', '+')
}

export function getFilterTagsBySection(section: string, tags: Tag[] | undefined): string[] {
    return tags?.filter((x: Tag) => x.id.startsWith(`${section}:`)).map((x: Tag) => {
        return x.label.toLowerCase()
    }) ?? []
}

export function isImgLink(url: string): boolean {
    return url.match(/^http[^?]*\.(jpg|jpeg|gif|png|tiff|bmp)(\?(.*))?$/gmi) != null
}
